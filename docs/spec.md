## 📌 Project Overview

A Node.js TypeScript CLI tool that listens for UniFi Protect webhooks, authenticates with the NVR API, and exports the corresponding video segment. The architecture follows a **Service-Provider** pattern to support multiple storage backends.

---

## 🏗️ Architecture & Core Components

### 1. The Storage Strategy (Provider Pattern)

* **Interface:** `IStorageProvider` defining an async `save(fileName: string, stream: Readable): Promise<void>` method.
* **Implementations:**
  * **MVP:** `FileSystemProvider` (saves to `./clips`).
  * **Future:** `R2Provider`, `S3Provider`, etc.
* **Selection:** The provider is instantiated at runtime based on the `STORAGE_TYPE` environment variable.

### 2. The Service Layer

* **`UnifiClient`:** Wrapper around the [`unifi-protect`](https://github.com/hjdhjd/unifi-protect) npm library handling session-based authentication and video exports.
* **`CaptureOrchestrator`:** Handles the webhook logic:
  * Validation of the payload.
  * Time window calculation (e.g., -10s / +20s).
  * Implementing a **Settling Delay** (waiting for NVR disk-write completion).
  * Piping the API stream directly to the active `IStorageProvider`.

### 3. Tech Stack & Standards

* **Runtime:** Node.js (Latest LTS) + TypeScript (ESM).
* **Libraries:** `express` (Webhook listener), `unifi-protect` (NVR API), `winston` (Logging), `zod` (Schema validation).
* **Environment:** `dotenv` for all secrets (NVR credentials, Storage keys).
* **Logging:** `LOG_LEVEL` env toggle for verbose output including raw payloads.

---

## 🚀 Implementation Roadmap

> See [implementation_plan.md](implementation_plan.md) for detailed phase breakdown.

| Phase | Goal |
|-------|------|
| **1. Project Scaffolding** | Setup TS, ESLint, Zod, Logger ✅ |
| **2. Scout Utility** | Webhook listener to capture real NVR events |
| **3. Core Utilities** | TDD for time window calculations and file naming |
| **4. UniFi Client** | Authenticated API client using `unifi-protect` |
| **5. Storage Layer** | FileSystem provider (Stream-to-disk) |
| **6. Orchestrator** | Wire Webhook → Client → Storage |
| **7. HTTP Server** | Production-ready Express server |
| **8. Hardening** | Dockerization and deployment docs |

---

## 🔐 Environment Schema (`.env`)

```bash
# Logging
LOG_LEVEL=debug  # debug, info, warn, error

# UniFi NVR
UNIFI_HOST=192.168.1.1
UNIFI_USER=...
UNIFI_PASS=...

# Storage
STORAGE_TYPE=fs  # fs, r2, s3
OUTPUT_DIR=./clips

# Capture timing
CAPTURE_PRE_BUFFER_SECONDS=10
CAPTURE_POST_BUFFER_SECONDS=20
SETTLING_DELAY_SECONDS=5

# Server
WEBHOOK_PORT=3000
```

---

## 🧪 Testing Requirements

* **Unit Tests:** Must achieve >80% coverage on utility functions and the orchestrator logic.
* **Integration Tests:** Mock the UniFi API using `msw` (Mock Service Worker) to ensure the stream pipe doesn't break under network pressure.
