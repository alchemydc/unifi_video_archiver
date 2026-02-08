## 📌 Project Overview

A Node.js TypeScript CLI tool that listens for UniFi Protect webhooks, authenticates with the NVR API, and exports the corresponding video segment. The architecture follows a **Service-Provider** pattern to support multiple storage backends.

---

## 🏗️ Architecture & Core Components

### 1. The Storage Strategy (Provider Pattern)

* **Interface:** `IStorageProvider` defining an async `save(fileName: string, stream: Readable): Promise<void>` method.
* **Implementations:** * **MVP:** `FileSystemProvider` (saves to `./clips`).
* **Future:** `R2Provider`, `S3Provider`, etc.


* **Selection:** The provider is instantiated at runtime based on the `STORAGE_TYPE` environment variable.

### 2. The Service Layer

* **`UnifiClient`:** Singleton handling session-based authentication (`unifises` cookie) and HTTP GET requests for video exports.
* **`CaptureOrchestrator`:** Handles the webhook logic:
* Validation of the payload.
* Time window calculation (e.g., ).
* Implementing a **Settling Delay** (waiting for NVR disk-write completion).
* Piping the API stream directly to the active `IStorageProvider`.



### 3. Tech Stack & Standards

* **Runtime:** Node.js (Latest LTS) + TypeScript.
* **Libraries:** `express` (Webhook listener), `axios` + `tough-cookie` (API), `winston` (Logging), `zod` (Schema validation).
* **Environment:** `dotenv` for all secrets (NVR credentials, Storage keys).
* **Logging:** `DEBUG` env toggle for verbose output including raw payloads and axios interceptor logs.

---

## 🚀 Implementation Roadmap

### Phase 1: The "Skeleton" & Webhook Scout

Before building the download logic, create a utility script (`npm run scout`) that:

1. Starts a basic Express server.
2. Uses `zod` to log and validate the exact shape of the incoming UniFi webhook.
3. Outputs the JSON to a file for use as a test fixture.

### Phase 2: TDD & Core Logic

* **Setup:** Vitest for testing.
* **Test Case 1:** `TimeWindowUtil` correctly generates Epoch timestamps.
* **Test Case 2:** `FileSystemProvider` correctly pipes a mock stream to a local folder.
* **Test Case 3:** `UnifiClient` handles 401 Unauthorized by attempting a re-login.

### Phase 3: The MVP Pipeline

1. Initialize `UnifiClient` on startup.
2. Register webhook route.
3. On POST: Trigger orchestrator  Fetch stream  Pipe to `FileSystemProvider`.

---

## 🔐 Environment Schema (`.env`)

```bash
LOG_LEVEL=debug # debug, info, warn, error
UNIFI_HOST=192.168.1.1
UNIFI_USER=...
UNIFI_PASS=...
STORAGE_TYPE=fs # fs, r2, s3
OUTPUT_DIR=./clips
# (Future R2 keys go here)

```

---

## 🧪 Testing Requirements

* **Unit Tests:** Must achieve >80% coverage on utility functions and the orchestrator logic.
* **Integration Tests:** Mock the UniFi API using `msw` (Mock Service Worker) to ensure the stream pipe doesn't break under network pressure.
