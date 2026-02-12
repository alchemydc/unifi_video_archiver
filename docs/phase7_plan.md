# Phase 7: HTTP Server — Step-by-Step Implementation Plan

## Goal

Create a production-ready Express HTTP server that:
1. Receives UniFi Protect webhook POST requests
2. Validates them with Zod
3. Passes them to the `CaptureOrchestrator`
4. Exposes a `/health` endpoint
5. Handles graceful shutdown (SIGTERM/SIGINT)

---

## Architecture Overview

```
┌──────────────────────┐
│   UniFi Protect NVR  │
│   (Alarm Manager)    │
└──────────┬───────────┘
           │ HTTP POST /webhook
           ▼
┌──────────────────────┐
│   Express Server     │
│   src/server/        │
│   ├── app.ts         │  ← Express app (routes, middleware)
│   └── index.ts       │  ← Re-exports + createServer()
└──────────┬───────────┘
           │ validated payload
           ▼
┌──────────────────────┐
│  CaptureOrchestrator │  ← Already implemented
└──────────────────────┘
```

---

## Prerequisites

Before starting, verify you can successfully run:
```bash
npm run build   # TypeScript compiles
npm run lint    # No lint errors
npm run test    # All 37 tests pass
```

---

## Step-by-Step Implementation

### Step 1: Create `src/server/app.ts`

This file defines the Express application with all routes and middleware. It does **not** call `app.listen()` — that responsibility belongs to the entry point (`src/index.ts`).

**File:** `src/server/app.ts`

```typescript
import express, { type Request, type Response } from 'express';
import { logger } from '../config/logger.js';
import { webhookPayloadSchema } from '../schemas/webhook.schema.js';
import type { CaptureOrchestrator } from '../orchestrator/capture-orchestrator.js';

/**
 * Creates and configures the Express application.
 * The orchestrator is injected to keep the app testable.
 */
export function createApp(orchestrator: CaptureOrchestrator): express.Application {
    const app = express();

    // --- Middleware ---
    app.use(express.json());

    // --- Routes ---

    // Health check
    app.get('/health', (_req: Request, res: Response) => {
        res.status(200).json({ status: 'ok', uptime: process.uptime() });
    });

    // Webhook receiver
    app.post('/webhook', async (req: Request, res: Response) => {
        const parseResult = webhookPayloadSchema.safeParse(req.body);

        if (!parseResult.success) {
            logger.warn('Invalid webhook payload received', {
                errors: parseResult.error.flatten(),
            });
            res.status(400).json({ error: 'Invalid payload', details: parseResult.error.flatten() });
            return;
        }

        const payload = parseResult.data;
        logger.info(`Webhook received: ${payload.alarm.name}`, {
            triggers: payload.alarm.triggers?.length ?? 0,
            timestamp: payload.timestamp,
        });

        try {
            const result = await orchestrator.handleWebhook(payload);
            res.status(200).json({
                status: 'archived',
                location: result.location,
                sizeBytes: result.sizeBytes,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`Pipeline failed: ${message}`, { error: err });
            res.status(500).json({ error: 'Pipeline failed', message });
        }
    });

    return app;
}
```

**Key design decisions:**
- `createApp()` takes the orchestrator as a parameter (dependency injection) so tests can inject a mock orchestrator.
- The app does NOT call `app.listen()`. This separation allows testing the routes without starting a real server.
- `webhookPayloadSchema.safeParse()` validates without throwing, giving the handler control over the error response.
- Errors from the orchestrator pipeline are caught and returned as 500 with a descriptive message.

---

### Step 2: Create `src/server/index.ts`

This is the barrel export for the server module.

**File:** `src/server/index.ts`

```typescript
export { createApp } from './app.js';
```

---

### Step 3: Rewrite `src/index.ts` (Application Entry Point)

Replace the current placeholder entry point with the production startup logic.

**File:** `src/index.ts` (overwrite existing)

```typescript
import { logger } from './config/logger.js';
import { env } from './config/env.schema.js';
import { createUnifiClient } from './clients/unifi-protect-client.js';
import { createStorageProvider } from './storage/index.js';
import { createOrchestrator } from './orchestrator/index.js';
import { createApp } from './server/index.js';
import type { Server } from 'node:http';

async function main(): Promise<void> {
    // 1. Initialize dependencies
    const client = createUnifiClient();
    logger.info('Connecting to UniFi Protect NVR...');
    await client.connect();

    const storage = createStorageProvider();
    const orchestrator = createOrchestrator(client, storage);

    // 2. Create and start Express server
    const app = createApp(orchestrator);
    const server: Server = app.listen(env.WEBHOOK_PORT, () => {
        logger.info(`Server listening on port ${env.WEBHOOK_PORT}`, {
            storage: env.STORAGE_TYPE,
            outputDir: env.OUTPUT_DIR,
        });
    });

    // 3. Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        server.close(() => {
            logger.info('HTTP server closed');
        });
        client.disconnect();
        logger.info('Disconnected from NVR');
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    logger.error('Fatal startup error', { error: err });
    process.exit(1);
});
```

**Key design decisions:**
- `main()` is an async function so we can `await client.connect()` before starting the server.
- Graceful shutdown closes the HTTP server (stops accepting new connections), disconnects from the NVR, and exits.
- Fatal errors during startup are caught and logged, then the process exits with code 1.

---

### Step 4: Write Unit Tests for `src/server/app.ts`

**File:** `src/server/app.test.ts`

Use `supertest` to test the Express routes without starting a real server.

> **Important:** You must install `supertest` as a dev dependency:
> ```bash
> npm install --save-dev supertest @types/supertest
> ```

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import type { CaptureOrchestrator } from '../orchestrator/capture-orchestrator.js';
import type { WebhookPayload } from '../schemas/webhook.schema.js';

// Build a valid webhook payload
const makePayload = (): WebhookPayload => ({
    alarm: {
        name: 'Test Alarm',
        triggers: [{ key: 'motion', device: 'AABBCCDDEE11' }],
    },
    timestamp: Date.now(),
});

describe('Express App', () => {
    let mockOrchestrator: { handleWebhook: ReturnType<typeof vi.fn> };
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
        mockOrchestrator = {
            handleWebhook: vi.fn().mockResolvedValue({
                location: '/clips/2026-02-12/test.mp4',
                sizeBytes: 1024,
            }),
        };
        app = createApp(mockOrchestrator as unknown as CaptureOrchestrator);
    });

    describe('GET /health', () => {
        it('should return 200 with ok status', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.uptime).toBeTypeOf('number');
        });
    });

    describe('POST /webhook', () => {
        it('should return 200 on valid payload', async () => {
            const payload = makePayload();
            const res = await request(app)
                .post('/webhook')
                .send(payload);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('archived');
            expect(res.body.location).toBeDefined();
            expect(mockOrchestrator.handleWebhook).toHaveBeenCalledWith(
                expect.objectContaining({ timestamp: payload.timestamp }),
            );
        });

        it('should return 400 on invalid payload (missing timestamp)', async () => {
            const res = await request(app)
                .post('/webhook')
                .send({ alarm: { name: 'Test' } });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid payload');
        });

        it('should return 400 on empty body', async () => {
            const res = await request(app)
                .post('/webhook')
                .send({});

            expect(res.status).toBe(400);
        });

        it('should return 500 when orchestrator throws', async () => {
            mockOrchestrator.handleWebhook.mockRejectedValue(
                new Error('NVR connection lost'),
            );

            const res = await request(app)
                .post('/webhook')
                .send(makePayload());

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Pipeline failed');
            expect(res.body.message).toBe('NVR connection lost');
        });
    });
});
```

**Test coverage goals:**
| Scenario | Expected |
|----------|----------|
| `GET /health` | 200, `{ status: 'ok', uptime: <number> }` |
| `POST /webhook` valid payload | 200, `{ status: 'archived', ... }` |
| `POST /webhook` invalid payload | 400, `{ error: 'Invalid payload' }` |
| `POST /webhook` empty body | 400 |
| `POST /webhook` orchestrator error | 500, `{ error: 'Pipeline failed' }` |

---

### Step 5: Verification Checklist

After implementing all files, run these commands in order:

```bash
# 1. Install supertest
npm install --save-dev supertest @types/supertest

# 2. Build — must compile without errors
npm run build

# 3. Lint — must have 0 errors, 0 warnings
npm run lint

# 4. Tests — all tests must pass (previous 37 + new ~5 = ~42)
npm run test

# 5. Coverage — verify server/app.ts has >90% coverage
npm run test:coverage
```

---

## Summary of Files

| Action | File | Purpose |
|--------|------|---------|
| **NEW** | `src/server/app.ts` | Express app with `/health` and `/webhook` routes |
| **NEW** | `src/server/index.ts` | Barrel export |
| **NEW** | `src/server/app.test.ts` | Unit tests using `supertest` |
| **MODIFY** | `src/index.ts` | Full startup: connect NVR, create server, graceful shutdown |
| **INSTALL** | `supertest`, `@types/supertest` | HTTP assertion library for testing |

---

## Important Notes

- **Do NOT add a `clean` script** to `package.json` — the user has not requested one.
- **Express is already installed** as a dependency (`express@5.2.1`).
- **`@types/express` is already installed** as a dependency.
- The `WEBHOOK_PORT` env var already exists in `env.schema.ts` (default: `3000`).
- The webhook schema (`webhookPayloadSchema`) already exists and handles `.safeParse()`.
- The `CaptureOrchestrator` is already built and tested.
- All existing patterns (DI, factory functions, Winston logging) should be followed.
