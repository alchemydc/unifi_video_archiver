# Phase 2: Scout Utility - Detailed Implementation Plan

## Objective

Create a standalone utility script (`npm run scout`) that starts an Express server to receive UniFi Protect webhook events, validates the payload structure using Zod, and outputs captured events as test fixture JSON files.

---

## Prerequisites

Phase 1 is complete. The following infrastructure already exists:

| Component | Location | Purpose |
|-----------|----------|---------|
| Environment validation | `src/config/env.schema.ts` | Zod schema for `.env` |
| Logger | `src/config/logger.ts` | Winston logger |
| Entry point | `src/index.ts` | Main app (not used by scout) |
| Port config | `WEBHOOK_PORT` in `.env` | Defaults to 3000 |

---

## Task Breakdown

### 2.1 Create Scout Entry Point

**File:** `src/bin/scout.ts`

**Requirements:**
1. Import Express and create a minimal HTTP server
2. Use `WEBHOOK_PORT` from environment config
3. Register a single POST route at `/webhook`
4. Log startup message with port number

**Code Structure:**
```typescript
import express from 'express';
import { logger } from '../config/logger.js';
import { env } from '../config/env.schema.js';

const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  // Handle webhook (see 2.2 and 2.3)
});

app.listen(env.WEBHOOK_PORT, () => {
  logger.info(`Scout listening on port ${env.WEBHOOK_PORT}`);
});
```

---

### 2.2 Define Zod Schema for Webhook Payload

**File:** `src/schemas/webhook.schema.ts`

**Requirements:**
1. Define a Zod schema matching the expected UniFi Protect webhook payload
2. Export both the schema and inferred TypeScript type
3. Make the schema flexible to capture unknown fields (for discovery)

**Expected Payload Structure:**
```json
{
  "alarm": {
    "name": "Barking Dog Alert",
    "sources": [],
    "conditions": [{ "condition": { "type": "is", "source": "motion" } }],
    "triggers": [{ "key": "motion", "device": "DEVICE_ID_HEX" }]
  },
  "timestamp": 1722526793954
}
```

**Code Structure:**
```typescript
import { z } from 'zod';

// Flexible schema for discovery - use passthrough to capture unknown fields
export const webhookPayloadSchema = z.object({
  alarm: z.object({
    name: z.string(),
    sources: z.array(z.unknown()).optional(),
    conditions: z.array(z.unknown()).optional(),
    triggers: z.array(z.object({
      key: z.string(),
      device: z.string(),
    })).optional(),
  }),
  timestamp: z.number(),
}).passthrough();

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
```

---

### 2.3 Implement Webhook Handler

**File:** `src/bin/scout.ts` (update POST handler)

**Requirements:**
1. Parse and validate incoming JSON using Zod schema
2. Log the raw payload at `debug` level
3. Log validation success/failure at `info` level
4. Save valid payloads to `test/fixtures/` directory
5. Return 200 OK on success, 400 Bad Request on validation failure

**Handler Logic:**
```typescript
import { webhookPayloadSchema } from '../schemas/webhook.schema.js';
import { saveFixture } from '../utils/fixture-writer.js';

app.post('/webhook', async (req, res) => {
  logger.debug('Raw payload received', { body: req.body });
  
  const result = webhookPayloadSchema.safeParse(req.body);
  
  if (!result.success) {
    logger.warn('Validation failed', { errors: result.error.flatten() });
    return res.status(400).json({ error: 'Invalid payload', details: result.error.flatten() });
  }
  
  logger.info('Valid webhook received', { alarmName: result.data.alarm.name });
  await saveFixture(result.data);
  
  res.status(200).json({ status: 'ok' });
});
```

---

### 2.4 Implement Fixture Writer Utility

**File:** `src/utils/fixture-writer.ts`

**Requirements:**
1. Create `test/fixtures/` directory if it doesn't exist
2. Generate timestamped filename (e.g., `webhook-2026-02-09T11-50-00.json`)
3. Write JSON with pretty formatting (2-space indent)
4. Return the path of the saved file

**Code Structure:**
```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WebhookPayload } from '../schemas/webhook.schema.js';
import { logger } from '../config/logger.js';

const FIXTURES_DIR = 'test/fixtures';

export async function saveFixture(payload: WebhookPayload): Promise<string> {
  await mkdir(FIXTURES_DIR, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `webhook-${timestamp}.json`;
  const filepath = join(FIXTURES_DIR, filename);
  
  await writeFile(filepath, JSON.stringify(payload, null, 2));
  logger.info(`Fixture saved: ${filepath}`);
  
  return filepath;
}
```

---

### 2.5 Add Unit Tests

**File:** `src/utils/fixture-writer.test.ts`

**Requirements:**
1. Test that `saveFixture` creates the directory if missing
2. Test that the file is written with correct JSON content
3. Test filename format includes timestamp

**File:** `src/schemas/webhook.schema.test.ts`

**Requirements:**
1. Test valid payload passes validation
2. Test missing `timestamp` fails validation
3. Test missing `alarm.name` fails validation
4. Test extra fields are preserved (passthrough)

---

## File Structure After Phase 2

```
src/
├── bin/
│   └── scout.ts           # Scout utility entry point
├── config/
│   ├── env.schema.ts      # (existing)
│   └── logger.ts          # (existing)
├── schemas/
│   └── webhook.schema.ts  # Zod webhook payload schema
├── utils/
│   └── fixture-writer.ts  # Saves payloads to test/fixtures/
├── index.ts               # (existing, unchanged)
test/
└── fixtures/              # Auto-created by scout
    └── webhook-*.json     # Captured webhook payloads
```

---

## Verification Steps

### 1. Build & Lint
```bash
npm run build
npm run lint
```

### 2. Run Scout
```bash
npm run scout
# Expected output: "Scout listening on port 3000"
```

### 3. Test with curl
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"alarm":{"name":"Test Alarm"},"timestamp":1722526793954}'
```
**Expected:** 200 OK, fixture file created in `test/fixtures/`

### 4. Test Validation Failure
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"invalid":"data"}'
```
**Expected:** 400 Bad Request with validation error details

### 5. Run Unit Tests
```bash
npm run test
```
**Expected:** All tests pass

---

## Testing with Real NVR

1. Start the scout: `npm run scout`
2. Configure UniFi Protect webhook:
   - Alarm Manager → Create Alarm
   - Trigger: Motion on any camera
   - Action: Webhook → Custom Webhook
   - URL: `http://<your-machine-ip>:3000/webhook`
   - Advanced: Enable HTTP POST
3. Trigger motion event on a camera
4. Check `test/fixtures/` for the captured JSON payload

---

## Success Criteria

- [ ] `npm run scout` starts Express server on configured port
- [ ] POST to `/webhook` validates payload using Zod
- [ ] Valid payloads are saved to `test/fixtures/` with timestamped filenames
- [ ] Invalid payloads return 400 with error details
- [ ] Unit tests exist for schema validation and fixture writer
- [ ] All tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Lint passes (`npm run lint`)
