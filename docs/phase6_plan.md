# Phase 6: Capture Orchestrator — Detailed Implementation Plan

## Objective

Build the `CaptureOrchestrator` — the central coordinator that receives a validated webhook payload and drives the full capture pipeline: settling delay → camera lookup → video export → storage. This module wires together all components built in Phases 3–5.

---

## Prerequisites

| Requirement | Source | Status |
|-------------|--------|--------|
| `WebhookPayload` type (incl. `alarm.triggers[].device` MAC) | `src/schemas/webhook.schema.ts` | ✅ |
| `computeTimeWindow(timestamp, pre, post)` → `TimeWindow` | `src/utils/time-window.ts` | ✅ |
| `generateClipFilename(payload)` → `string` | `src/utils/file-name.ts` | ✅ |
| `UnifiProtectClient` (connect, findCameraByMac, exportVideoClip, disconnect) | `src/clients/unifi-protect-client.ts` | ✅ |
| `IStorageProvider.save(stream, filename, timestamp)` → `StorageResult` | `src/storage/storage-provider.ts` | ✅ |
| `SETTLING_DELAY_SECONDS`, `CAPTURE_PRE_BUFFER_SECONDS`, `CAPTURE_POST_BUFFER_SECONDS` | `src/config/env.schema.ts` | ✅ |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Dependency injection** | `CaptureOrchestrator` receives `UnifiProtectClient` and `IStorageProvider` in its constructor. This makes testing trivial — inject mocks without module-level mocking. |
| **Settling delay** | Wait `SETTLING_DELAY_SECONDS` before requesting video export. The NVR needs time to flush recorded video to disk after an event. |
| **Simple error handling** | For MVP, errors are logged and re-thrown. The HTTP server layer (Phase 7) will catch and return appropriate status codes. No retry logic in the orchestrator itself. |
| **Single trigger per payload** | Use `triggers[0].device` for the camera MAC. If no triggers exist, log a warning and skip. |
| **Orchestrator does not manage client lifecycle** | The caller (HTTP server in Phase 7) is responsible for calling `connect()` and `disconnect()` on the client. The orchestrator only uses an already-connected client. |

---

## Task Breakdown

### 6.1 Create `CaptureOrchestrator` Class

**File:** `src/orchestrator/capture-orchestrator.ts` [NEW]

The orchestrator class that drives the full capture pipeline.

**Constructor parameters:**
- `client: UnifiProtectClient` — already connected
- `storage: IStorageProvider` — configured storage provider
- `settlingDelayMs: number` — from `SETTLING_DELAY_SECONDS * 1000`
- `preBufferSeconds: number` — from `CAPTURE_PRE_BUFFER_SECONDS`
- `postBufferSeconds: number` — from `CAPTURE_POST_BUFFER_SECONDS`

**Main method: `handleWebhook(payload: WebhookPayload): Promise<StorageResult>`**

Pipeline steps:
1. Extract MAC from `payload.alarm.triggers[0].device`
   - If no triggers, throw `Error('No trigger device found in webhook payload')`
2. Find the camera via `client.findCameraByMac(mac)`
   - If not found, throw `Error('Camera not found for MAC: ...')`
3. Compute the time window via `computeTimeWindow(payload.timestamp, preBufferSeconds, postBufferSeconds)`
4. Generate the filename via `generateClipFilename(payload)`
5. Wait for the settling delay: `await delay(settlingDelayMs)`
6. Export the video clip via `client.exportVideoClip(camera, timeWindow)`
7. Save to storage via `storage.save(stream, filename, payload.timestamp)`
8. Log success and return the `StorageResult`

**Code:**

```typescript
import { logger } from '../config/logger.js';
import type { WebhookPayload } from '../schemas/webhook.schema.js';
import type { UnifiProtectClient } from '../clients/unifi-protect-client.js';
import type { IStorageProvider, StorageResult } from '../storage/storage-provider.js';
import { computeTimeWindow } from '../utils/time-window.js';
import { generateClipFilename } from '../utils/file-name.js';

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class CaptureOrchestrator {
    constructor(
        private readonly client: UnifiProtectClient,
        private readonly storage: IStorageProvider,
        private readonly settlingDelayMs: number,
        private readonly preBufferSeconds: number,
        private readonly postBufferSeconds: number,
    ) {}

    async handleWebhook(payload: WebhookPayload): Promise<StorageResult> {
        // 1. Extract camera MAC from trigger
        const mac = payload.alarm.triggers?.[0]?.device;
        if (!mac) {
            throw new Error('No trigger device found in webhook payload');
        }

        // 2. Find camera
        const camera = this.client.findCameraByMac(mac);
        if (!camera) {
            throw new Error(`Camera not found for MAC: ${mac}`);
        }
        logger.info(`Processing event for camera: ${camera.name} (${mac})`);

        // 3. Compute time window
        const timeWindow = computeTimeWindow(
            payload.timestamp,
            this.preBufferSeconds,
            this.postBufferSeconds,
        );
        logger.debug(`Time window: ${new Date(timeWindow.start).toISOString()} → ${new Date(timeWindow.end).toISOString()}`);

        // 4. Generate filename
        const filename = generateClipFilename(payload);
        logger.debug(`Filename: ${filename}`);

        // 5. Settling delay
        if (this.settlingDelayMs > 0) {
            logger.info(`Waiting ${this.settlingDelayMs / 1000}s for NVR to flush video...`);
            await delay(this.settlingDelayMs);
        }

        // 6. Export video clip
        logger.info(`Exporting video clip from NVR...`);
        const stream = await this.client.exportVideoClip(camera, timeWindow);

        // 7. Save to storage
        const result = await this.storage.save(stream, filename, payload.timestamp);
        logger.info(`Clip archived: ${result.location} (${result.sizeBytes} bytes)`);

        return result;
    }
}
```

---

### 6.2 Create a Factory Function

**File:** `src/orchestrator/index.ts` [NEW]

Convenience factory that creates the orchestrator from environment configuration and pre-built dependencies.

```typescript
import { env } from '../config/env.schema.js';
import { CaptureOrchestrator } from './capture-orchestrator.js';
import type { UnifiProtectClient } from '../clients/unifi-protect-client.js';
import type { IStorageProvider } from '../storage/storage-provider.js';

export function createOrchestrator(
    client: UnifiProtectClient,
    storage: IStorageProvider,
): CaptureOrchestrator {
    return new CaptureOrchestrator(
        client,
        storage,
        env.SETTLING_DELAY_SECONDS * 1000,
        env.CAPTURE_PRE_BUFFER_SECONDS,
        env.CAPTURE_POST_BUFFER_SECONDS,
    );
}

export { CaptureOrchestrator } from './capture-orchestrator.js';
```

---

### 6.3 Write Unit Tests

**File:** `src/orchestrator/capture-orchestrator.test.ts` [NEW]

Since the orchestrator uses dependency injection, all dependencies are injected as mocks — no need for `vi.mock()` at the module level.

**Test cases:**

| # | Test | What to Assert |
|---|------|---------------|
| 1 | **Happy path**: full pipeline succeeds | All methods called in order, `StorageResult` returned correctly |
| 2 | **No triggers in payload** | Throws `'No trigger device found in webhook payload'` |
| 3 | **Camera not found** | Throws `'Camera not found for MAC: ...'` |
| 4 | **Video export failure** | If `exportVideoClip` throws, the error propagates |
| 5 | **Storage failure** | If `storage.save` throws, the error propagates |
| 6 | **Settling delay applied** | Verify a delay is applied before export (use `vi.useFakeTimers()`) |
| 7 | **Zero settling delay** | If `settlingDelayMs = 0`, no delay is applied |

**Test pattern:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaptureOrchestrator } from './capture-orchestrator.js';
import { Readable } from 'node:stream';
import type { WebhookPayload } from '../schemas/webhook.schema.js';

// Build a valid payload
const makePayload = (overrides?: Partial<WebhookPayload>): WebhookPayload => ({
    alarm: {
        name: 'Test Alarm',
        triggers: [{ key: 'motion', device: 'AABBCCDDEEFF' }],
    },
    timestamp: 1770840108431,
    ...overrides,
});

describe('CaptureOrchestrator', () => {
    let mockClient: any;
    let mockStorage: any;
    let orchestrator: CaptureOrchestrator;

    beforeEach(() => {
        mockClient = {
            findCameraByMac: vi.fn().mockReturnValue({ id: 'cam-1', name: 'Test Cam', mac: 'AABBCCDDEEFF' }),
            exportVideoClip: vi.fn().mockResolvedValue(Readable.from([Buffer.from('video')])),
        };
        mockStorage = {
            save: vi.fn().mockResolvedValue({ location: '/clips/2026-02-11/test.mp4', sizeBytes: 5 }),
        };
        // Use 0ms settling delay in most tests to avoid real waits
        orchestrator = new CaptureOrchestrator(mockClient, mockStorage, 0, 10, 20);
    });

    it('should process a webhook through the full pipeline', async () => {
        const payload = makePayload();
        const result = await orchestrator.handleWebhook(payload);

        expect(mockClient.findCameraByMac).toHaveBeenCalledWith('AABBCCDDEEFF');
        expect(mockClient.exportVideoClip).toHaveBeenCalled();
        expect(mockStorage.save).toHaveBeenCalled();
        expect(result.location).toBe('/clips/2026-02-11/test.mp4');
    });

    it('should throw if no triggers in payload', async () => {
        const payload = makePayload({ alarm: { name: 'No Triggers' } });
        await expect(orchestrator.handleWebhook(payload)).rejects.toThrow('No trigger device');
    });

    // ... additional test cases per table above
});
```

---

## File Structure After Phase 6

```
src/
├── bin/
│   ├── scout.ts                         # (existing)
│   ├── test-client.ts                   # (existing)
│   └── test-storage.ts                  # (existing)
├── clients/
│   ├── unifi-protect-client.ts          # (existing)
│   └── unifi-protect-client.test.ts     # (existing)
├── config/                              # (existing)
├── orchestrator/                        # [NEW directory]
│   ├── capture-orchestrator.ts          # [NEW] Core pipeline logic
│   ├── capture-orchestrator.test.ts     # [NEW] Unit tests
│   └── index.ts                         # [NEW] Factory + re-exports
├── schemas/                             # (existing)
├── storage/                             # (existing)
├── utils/                               # (existing)
└── index.ts                             # (existing)
```

---

## Implementation Order

Execute in this exact order:

1. **6.1** — `capture-orchestrator.ts` (the core class)
2. **6.2** — `index.ts` (factory and re-exports)
3. **6.3** — `capture-orchestrator.test.ts` (unit tests)

---

## Verification Plan

### Automated Tests
```bash
npm run build        # TypeScript compiles without errors
npm run lint         # No lint errors
npm run test         # All tests pass (new + existing)
npm run test:coverage # Verify >90% coverage for new files
```

### Manual Smoke Test

> [!NOTE]
> This smoke test is optional and requires a live NVR and a `.env` configured with real credentials plus `TEST_MAC_ADDRESS`.

The orchestrator can be manually tested by creating a utility that connects to the NVR, creates a synthetic webhook payload, and runs the full pipeline:

```typescript
import { createUnifiClient } from '../clients/unifi-protect-client.js';
import { createStorageProvider } from '../storage/index.js';
import { createOrchestrator } from '../orchestrator/index.js';
import type { WebhookPayload } from '../schemas/webhook.schema.js';

const client = createUnifiClient();
await client.connect();

const storage = createStorageProvider();
const orchestrator = createOrchestrator(client, storage);

// Synthetic payload mimicking a real webhook
const payload: WebhookPayload = {
    alarm: {
        name: 'Smoke Test',
        triggers: [{ key: 'motion', device: process.env.TEST_MAC_ADDRESS! }],
    },
    timestamp: Date.now() - 30000, // 30 seconds ago
};

try {
    const result = await orchestrator.handleWebhook(payload);
    console.log('Success! Clip saved to:', result.location);
} finally {
    client.disconnect();
    process.exit(0);
}
```

Add to `package.json`:
```json
"test-orchestrator": "node --loader ts-node/esm src/bin/test-orchestrator.ts"
```

---

## Edge Cases & Gotchas

| Issue | Mitigation |
|-------|------------|
| NVR session expired during export | `exportVideoClip` throws; orchestrator propagates the error. Phase 7 HTTP server can retry at a higher level. |
| Settling delay too short | Video export may return a truncated clip. Tunable via `SETTLING_DELAY_SECONDS`. Default of 5s has been validated on the user's UDM SE. |
| Multiple triggers in one payload | Only the first trigger is used (`triggers[0].device`). This is documented as an MVP limitation. |
| Webhook arrives with no triggers | Handled explicitly with a clear error message. |
| Camera MAC not in bootstrap | Handled explicitly with a clear error message indicating the MAC that was searched. |
| Concurrent webhooks | The orchestrator is stateless — each call to `handleWebhook` is independent. Concurrency control is deferred to Phase 7. |
