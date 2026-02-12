# Phase 4: UniFi Client — Detailed Implementation Plan

## Objective

Build a `UnifiProtectClient` wrapper around the `unifi-protect` npm library that provides:
1. Session management (login, auto-reconnect on 401)
2. Camera lookup by device ID (from webhook triggers)
3. Video clip export as a `Readable` stream (used by Phase 5's Storage Layer)

---

## Prerequisites

| Requirement | Status |
|-------------|--------|
| Phase 1–3 complete | ✅ |
| `unifi-protect` installed | ✅ `^4.27.7` in `package.json` |
| Env vars `UNIFI_HOST`, `UNIFI_USER`, `UNIFI_PASS` | ✅ In `env.schema.ts` |
| `TimeWindow` type and `computeTimeWindow()` | ✅ In `time-window.ts` |
| Live webhook fixtures with `triggers[].device` | ✅ 8 fixtures in `test/fixtures/` |

---

## Key Findings from Library Research

The [`unifi-protect`](https://github.com/hjdhjd/unifi-protect) library (v4.27.7) provides:

| Feature | API | Notes |
|---------|-----|-------|
| **Auth** | `protect.login(host, user, pass)` → `boolean` | Cookie-based, CSRF tokens managed automatically |
| **Bootstrap** | `protect.getBootstrap()` → `boolean` | Loads all cameras, sensors, etc. into `protect.bootstrap` |
| **Camera list** | `protect.bootstrap?.cameras` | Array of `ProtectCameraConfig` objects |
| **Video export** | `protect.retrieve(url, options)` → `Dispatcher.ResponseData` | Raw HTTP; call `/proxy/protect/api/video/export` with query params |
| **Custom logging** | `new ProtectApi(log: ProtectLogging)` | Interface: `{ debug, error, info, warn }` — maps to Winston |
| **Session cleanup** | `protect.reset()` / `protect.logout()` | Clean shutdown of WebSockets + HTTP pool |

> [!IMPORTANT]
> The library does **not** have a dedicated video export method. You must use the generic `retrieve()` method to call the NVR's export API endpoint directly. The response body is a stream that delivers the raw MP4 bytes.

### Video Export API Endpoint

```
GET https://{UNIFI_HOST}/proxy/protect/api/video/export?camera={CAMERA_ID}&start={EPOCH_MS}&end={EPOCH_MS}
```

- `camera`: The camera's `id` field from `ProtectCameraConfig` (a UUID string, **not** the MAC/device hex from webhooks)
- `start` / `end`: Unix epoch milliseconds (from `TimeWindow`)
- Returns: streamed MP4 video with `Content-Type: video/mp4`

For the video export stream, the client should return a Node Readable (as this is most compatible with Phase 5's file-write piping)

If the client gets a 401 during video export, a simple throw-and-retry-at-orchestrator-level (Phase 6) is sufficient for MVP

### Camera ID ↔ Webhook Device Mapping

Webhook payloads contain `triggers[].device` as a **MAC address** (e.g., `A89C6C487E19`). The `ProtectCameraConfig` type has a `mac` field. The client must map the webhook's device MAC to the camera's `id` (UUID).

```typescript
// mapping logic
const camera = bootstrap.cameras.find(cam => cam.mac === deviceMac);
// then use camera.id for video export
```

---

## Task Breakdown

### 4.1 Create Winston → ProtectLogging Adapter

**File:** `src/config/protect-logging-adapter.ts` [NEW]

Create a thin adapter that maps the project's Winston logger to the `ProtectLogging` interface expected by the `unifi-protect` library.

**Steps:**
1. Import `ProtectLogging` from `unifi-protect`
2. Import the existing `logger` from `../config/logger.js`
3. Export a `protectLogger` object implementing `ProtectLogging`
4. Map each method (`debug`, `info`, `warn`, `error`) to the corresponding Winston call

**Code:**
```typescript
import type { ProtectLogging } from 'unifi-protect';
import { logger } from './logger.js';

export const protectLogger: ProtectLogging = {
    debug: (message: string, ...args: unknown[]) => logger.debug(message, ...args),
    info:  (message: string, ...args: unknown[]) => logger.info(message, ...args),
    warn:  (message: string, ...args: unknown[]) => logger.warn(message, ...args),
    error: (message: string, ...args: unknown[]) => logger.error(message, ...args),
};
```

**Tests:** No dedicated test file needed — this is a trivial mapping. It will be integration-tested via the client.

---

### 4.2 Create UniFi Protect Client

**File:** `src/clients/unifi-protect-client.ts` [NEW]

This is the main deliverable. A class that wraps `ProtectApi` and exposes three capabilities: session management, camera lookup, and video export.

**Steps:**

1. Create `src/clients/` directory
2. Create the file with the class below
3. The constructor accepts env config values; does **not** auto-connect (connect is explicit via `connect()`)

**Class API:**

```typescript
import { ProtectApi } from 'unifi-protect';
import type { ProtectCameraConfig } from 'unifi-protect';
import type { Readable } from 'node:stream';
import type { TimeWindow } from '../utils/time-window.js';

export class UnifiProtectClient {
    private api: ProtectApi;
    private host: string;
    private username: string;
    private password: string;

    constructor(host: string, username: string, password: string);

    /** Login and bootstrap. Throws on failure. */
    async connect(): Promise<void>;

    /** Find a camera by MAC address (from webhook trigger device field). Returns null if not found. */
    findCameraByMac(mac: string): ProtectCameraConfig | null;

    /** Export a video clip for the given camera and time window. Returns a Readable stream of MP4 bytes. Throws on failure. */
    async exportVideoClip(camera: ProtectCameraConfig, timeWindow: TimeWindow): Promise<Readable>;

    /** Clean shutdown. */
    disconnect(): void;
}
```

**Implementation details for each method:**

#### `constructor(host, username, password)`
1. Store credentials as private fields
2. Create `ProtectApi` instance with the `protectLogger` adapter: `this.api = new ProtectApi(protectLogger);`

#### `async connect()`
1. Call `await this.api.login(this.host, this.username, this.password)`
2. If login returns `false`, throw `new Error('UniFi Protect login failed')`
3. Call `await this.api.getBootstrap()`
4. If bootstrap returns `false`, throw `new Error('UniFi Protect bootstrap failed')`
5. Log the number of cameras found: `logger.info(\`Connected to NVR: ${this.api.name}, ${cameras.length} cameras\`)`

#### `findCameraByMac(mac: string)`
1. Get cameras from `this.api.bootstrap?.cameras ?? []`
2. Normalize the incoming MAC: strip colons/dashes, uppercase
3. Find camera where `camera.mac.toUpperCase() === normalizedMac`
4. Return the camera or `null`

#### `async exportVideoClip(camera, timeWindow)`
1. Build the export URL:
   ```
   https://${this.host}/proxy/protect/api/video/export?camera=${camera.id}&start=${timeWindow.start}&end=${timeWindow.end}
   ```
2. Call `this.api.retrieve(url, { method: 'GET' }, { timeout: 60000 })` — use a long timeout since video exports can take time
3. If response is `null` or status is not 2xx (`!this.api.responseOk(response.statusCode)`), throw `new Error(\`Video export failed: HTTP ${response?.statusCode}\`)`
4. Return `response.body` as `Readable` (Undici's `body` is a `ReadableStream`, but we convert: `import { Readable } from 'node:stream'; Readable.fromWeb(response.body)` — or simply return the body since undici `ResponseData.body` implements `AsyncIterable`)

> [!WARNING]
> The `retrieve()` method handles auth retries internally. However, if the session expires mid-export, the caller should handle errors. For MVP, a simple `throw` is sufficient. Retry logic for video export can be added in Phase 6.

#### `disconnect()`
1. Call `this.api.reset()`

---

### 4.3 Create a Factory Function

**File:** `src/clients/unifi-protect-client.ts` (same file, exported function)

Convenience factory that reads from `env` config:

```typescript
import { env } from '../config/env.schema.js';

export function createUnifiClient(): UnifiProtectClient {
    return new UnifiProtectClient(env.UNIFI_HOST, env.UNIFI_USER, env.UNIFI_PASS);
}
```

---

### 4.4 Write Unit Tests

**File:** `src/clients/unifi-protect-client.test.ts` [NEW]

Since this client wraps an external API, tests should **mock** `ProtectApi`. Use `vi.mock('unifi-protect')` to mock the library.

**Test cases:**

| # | Test | What to Assert |
|---|------|---------------|
| 1 | `connect()` succeeds | `login()` and `getBootstrap()` called with correct args |
| 2 | `connect()` throws on login failure | `login()` returns `false` → error thrown |
| 3 | `connect()` throws on bootstrap failure | `login()` returns `true`, `getBootstrap()` returns `false` → error thrown |
| 4 | `findCameraByMac()` finds camera | Given mock bootstrap with cameras, finds by MAC (case-insensitive) |
| 5 | `findCameraByMac()` returns null | MAC not in bootstrap |
| 6 | `exportVideoClip()` returns stream | Mock `retrieve()` to return a mock response, verify URL construction |
| 7 | `exportVideoClip()` throws on null response | Mock `retrieve()` to return `null` |
| 8 | `disconnect()` calls `reset()` | Verify `api.reset()` is called |

**Mocking pattern:**
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ProtectApi } from 'unifi-protect';

vi.mock('unifi-protect', () => {
    const MockProtectApi = vi.fn().mockImplementation(() => ({
        login: vi.fn().mockResolvedValue(true),
        getBootstrap: vi.fn().mockResolvedValue(true),
        bootstrap: {
            cameras: [
                { id: 'cam-uuid-1', mac: 'A89C6C487E19', name: 'Front Door' },
            ],
        },
        retrieve: vi.fn().mockResolvedValue({
            statusCode: 200,
            body: { pipe: vi.fn() },
        }),
        responseOk: vi.fn().mockReturnValue(true),
        reset: vi.fn(),
        name: 'Mock NVR [UDMP]',
    }));

    return { ProtectApi: MockProtectApi };
});
```

---

## File Structure After Phase 4

```
src/
├── clients/                          # [NEW directory]
│   ├── unifi-protect-client.ts       # [NEW]
│   └── unifi-protect-client.test.ts  # [NEW]
├── config/
│   ├── env.schema.ts                 # (existing)
│   ├── logger.ts                     # (existing)
│   └── protect-logging-adapter.ts    # [NEW]
├── schemas/
│   ├── webhook.schema.ts             # (existing)
│   └── webhook.schema.test.ts        # (existing)
├── utils/                            # (existing, unchanged)
│   ├── file-name.ts
│   ├── fixture-loader.ts
│   ├── fixture-writer.ts
│   └── time-window.ts
└── index.ts                          # (existing, unchanged)
```

---

## Implementation Order

Execute in this exact order:

1. **4.1** — `protect-logging-adapter.ts` (no dependencies, enables all later steps)
2. **4.2** — `unifi-protect-client.ts` (depends on 4.1)
3. **4.3** — Factory function in the same file (trivial)
4. **4.4** — `unifi-protect-client.test.ts` (write all tests, verify with mocks)

---

## Verification Plan

### Automated Tests
```bash
npm run build        # TypeScript compiles without errors
npm run lint         # No lint errors
npm run test         # All tests pass (new + existing)
npm run test:coverage # Verify coverage for new files
```

### Manual Smoke Test (Requires Live NVR)

> [!NOTE]
> This requires a `.env` configured with real NVR credentials.

Create a utility script `src/bin/test-client.ts`:
```typescript
import { createUnifiClient } from '../clients/unifi-protect-client.js';

const client = createUnifiClient();
await client.connect();

// Use the MAC from a real fixture
const camera = client.findCameraByMac('REAL_MAC_ADDRESS');
console.log('Found camera:', camera?.name);

client.disconnect();
```

Add a script to package.json to allow this test to be run easily
```json
"scripts": {
    "test-client": "node --loader ts-node/esm src/bin/test-client.ts"
}
```
Run: `npm run test-client`

Expected: logs the camera name, then exits cleanly.

---

## Edge Cases & Gotchas

| Issue | Mitigation |
|-------|------------|
| MAC format inconsistency (colons, dashes, lowercase) | Normalize both sides: strip separators, uppercase |
| Video export timeout on large clips | Use 60s timeout; document for future retry work |
| NVR returns 401 mid-session | Library auto-retries login internally; wrap export in try/catch |
| Camera not in bootstrap (deleted/offline) | `findCameraByMac()` returns `null`; caller must handle |
| Undici `body` type vs Node `Readable` | Use `Readable.fromWeb()` or rely on `AsyncIterable` interface |
