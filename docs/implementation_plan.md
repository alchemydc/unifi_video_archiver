# UniFi Video Archiver - Implementation Plan

## Executive Summary

A Node.js TypeScript CLI utility that listens for UniFi Protect native webhooks and archives video clips for evidence collection (e.g., barking dog incidents).

---

## Research Findings

### UniFi Protect Native Webhooks ✅

UniFi Protect has native webhook support via **Alarm Manager**:

**Configuration:**
1. Alarm Manager → Create/Edit Alarm
2. Set triggers (cameras/sensors + conditions like motion)
3. Add Action → Webhook → Custom Webhook
4. Enter webhook URL and save

**Webhook Payload (HTTP POST):**
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

> [!NOTE]
> Default is HTTP GET (no body). Must enable HTTP POST in Advanced Settings for the JSON payload.

---

### Authentication & API (via `unifi-protect` npm library)

The [unifi-protect](https://github.com/hjdhjd/unifi-protect) npm library provides:

| Feature | Details |
|---------|---------|
| **Auth** | Cookie-based with CSRF token (mimics web UI) |
| **Login** | `await protect.login(host, username, password)` |
| **Bootstrap** | `await protect.getBootstrap()` returns all cameras/devices |
| **Events** | WebSocket real-time event streaming |
| **Video Export** | `/proxy/protect/api/video/export` endpoint |

```typescript
import { ProtectApi } from "unifi-protect";
const protect = new ProtectApi();
await protect.login("192.168.1.1", "username", "password");
await protect.getBootstrap();
```

---

## MVP Scope (Per User Feedback)

| Item | Decision |
|------|----------|
| **Deduplication** | Not needed for MVP, document as future work |
| **Error handling** | Simple retry framework, note gaps in README |
| **Security** | Private network, no webhook auth needed |
| **Credentials** | Via `.env` file |
| **Time offsets** | Configurable via environment |
| **Testing** | Real NVR available for testing |

---

## Phase 1: Project Scaffolding ✅ Complete

**Goal:** Set up project structure, tooling, and configuration.

### Tasks

| # | Task | Description |
|---|------|-------------|
| 1.1 | Initialize project | `npm init`, TypeScript ESM config |
| 1.2 | Configure tooling | Vitest, ESLint, Prettier |
| 1.3 | Winston logger | Configurable levels with DEBUG toggle |
| 1.4 | Zod env schema | Runtime validation of `.env` |
| 1.5 | Environment template | `.env.example` with all options |

### Expected File Structure

```
src/
├── config/
│   ├── env.schema.ts      # Zod schema for env validation
│   └── logger.ts          # Winston configuration
├── index.ts               # Entry point
package.json
tsconfig.json
vitest.config.ts
.env.example
```

### Environment Variables

```bash
# Logging
LOG_LEVEL=debug  # debug, info, warn, error

# UniFi NVR
UNIFI_HOST=192.168.1.1
UNIFI_USER=admin
UNIFI_PASS=secret

# Storage
STORAGE_TYPE=fs  # fs (MVP), r2, s3 (future)
OUTPUT_DIR=./clips

# Capture timing
CAPTURE_PRE_BUFFER_SECONDS=10
CAPTURE_POST_BUFFER_SECONDS=20
SETTLING_DELAY_SECONDS=5

# Server
WEBHOOK_PORT=3000
```

### Verification

```bash
npm run build    # TypeScript compiles without errors
npm run lint     # No lint errors
npm run test     # Vitest runs (empty suite passes)
```

---

## Future Phases (Documented for Later Execution)

### Phase 2: Scout Utility ✅ Complete
- Express server to receive webhooks
- Log and validate payload with Zod
- Generate typed schema from real events
- Output test fixture JSON

### Phase 3: Core Utilities (TDD) ✅ Complete
- `TimeWindowUtil` - epoch timestamp generation with pre/post buffers
- `FileNameUtil` - safe filenames from events
- `FixtureLoader` - test helper for loading captured webhook payloads
- 100% statement and branch coverage on all utilities

### Phase 4: UniFi Client ✅ Complete
- Integrate `unifi-protect` npm library
- Winston → `ProtectLogging` adapter
- Session management (login, bootstrap, disconnect)
- Camera lookup by MAC address (webhook device → NVR UUID)
- Video export streaming as Node.js `Readable`
- Smoke-tested against live NVR (10 cameras discovered)

### Phase 5: Storage Layer
- `IStorageProvider` interface (Strategy Pattern)
- `FileSystemProvider` with YYYY-MM-DD directories
- Stream-to-file with error handling and atomic writes

### Phase 6: Capture Orchestrator
- Wire webhook → client → storage
- Settling delay implementation
- Integration tests with MSW

### Phase 7: HTTP Server
- Express webhook endpoint
- Health check `/health`
- Graceful shutdown

### Phase 8: Production Hardening
- Dockerfile (multi-stage build)
- docker-compose.yml
- README and deployment docs

---

## Known Limitations (To Document in README)

- [ ] No deduplication of overlapping motion events
- [ ] No webhook authentication/signature verification
- [ ] Limited error recovery for partial stream failures
- [ ] Single storage provider at a time
