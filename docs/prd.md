## 📄 PRD: UniFi Protect Webhook Capture (v1.0)

### 1. Product Summary

A high-performance Node.js CLI utility that listens for UniFi Protect webhooks and automates the archival of event-based video clips. It abstracts the storage layer to allow seamless transitions from local disk (MVP) to cloud providers (R2/S3) without touching the core logic.

### 2. Strategic Objectives

* **Reliability:** Use TDD to ensure the app handles network drops and NVR reboots.
* **Performance:** Use Node.js streams to maintain a near-zero memory footprint, regardless of video file size.
* **Scalability:** Implementation of the Strategy Pattern for storage backends.

---

### 3. Technical Requirements

| Requirement | Specification |
| --- | --- |
| **Runtime** | Node.js (Latest LTS) with TypeScript (ESM). |
| **Authentication** | Session-based (Cookie/CSRF) via `unifi-protect` library with auto-refresh on 401 errors. |
| **Validation** | `Zod` for runtime type-checking of incoming webhooks. |
| **Logging** | `Winston` with `LOG_LEVEL` toggle (log raw payloads, auth headers, and stream status). |
| **Testing** | `Vitest` for Unit/Integration; `MSW` for API mocking. |
| **Secrets** | `dotenv` (no hardcoded credentials). |

---

### 4. System Architecture

The application is divided into four distinct layers:

1. **Ingress Layer:** Express server listening for `POST` requests from UniFi Protect webhooks.
2. **Orchestration Layer:** Logic to calculate time offsets (e.g., -10s / +20s) and manage the "Settling Delay" (wait for NVR to finish writing).
3. **Client Layer:** `UnifiClient` class wrapping the `unifi-protect` npm library for NVR communication.
4. **Storage Layer:** Implementation of the `IStorageProvider` interface.

---

### 5. Functional Scope (MVP)

#### 5.1 Webhook Scouter (Utility)

A standalone script (`src/bin/scout.ts`) to verify webhook reception.

* **Action:** Log the exact JSON payload from a live motion event.
* **Goal:** Generate a `test-fixture.json` for the TDD suite.

#### 5.2 The Capture Pipeline

1. **Event Received:** Webhook triggers a capture request.
2. **Validation:** Verify the event contains a valid `device` ID and `timestamp`.
3. **Authentication Check:** Ensure the `UnifiClient` has a warm session.
4. **Buffer Delay:** Wait `SETTLING_DELAY_SECONDS` (configurable) to allow the NVR buffer to flush.
5. **Stream Request:** Request the export from: `/proxy/protect/api/video/export`.
6. **Persistence:** Pipe the incoming response stream to the `FileSystemProvider`.

#### 5.3 Storage Strategies

The `StorageManager` must factory-load the provider based on `process.env.STORAGE_TYPE`:

* **`fs` (MVP):** Writes to a local path (e.g., `/recordings/YYYY-MM-DD/`).
* **`r2` / `s3` (Future):** Uses the AWS SDK `@aws-sdk/lib-storage` to stream to buckets.

---

### 6. Success Metrics & Testing (TDD)

The implementation agent must provide a test suite covering:

* **Time Calculation:** Given an ISO string, does the app generate the correct Epoch milliseconds for the API?
* **Stream Handling:** Verify the `IStorageProvider` receives a `Readable` stream and closes the file handle only on completion.
* **Auth Resilience:** Mock a `401 Unauthorized` response and verify the client triggers a `login()` before retrying the original request.

---

### 7. Handoff Instructions for Agent

1. **Initialize:** Setup TS config and Zod schemas for the UniFi payload. ✅
2. **Scout:** Run the scouting script and trigger a manual motion event on a camera.
3. **TDD:** Write tests for the `TimeWindow` and `FileName` utilities before coding the orchestrator.
4. **Build:** Implement the `FileSystemProvider` and `UnifiClient`.
5. **Refine:** Add verbose logging levels to every step of the stream piping process.
