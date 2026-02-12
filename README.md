# UniFi Video Archiver

> A high-performance Node.js CLI utility that listens for UniFi Protect webhooks and automates the archival of event-based video clips.

## 📌 Product Summary

This tool acts as a bridge between your UniFi Protect NVR and a long-term storage solution. It listens for native UniFi Protect webhooks (configured via Alarm Manager), validates the events, and streams the corresponding video clips to your configured storage provider.

It is designed with **reliability** and **performance** in mind, using Node.js streams to maintain a near-zero memory footprint regardless of video file size, and the Strategy Pattern to support multiple storage backends (Local Disk MVP, with S3/R2 planned).

---

## 🚀 Current Status

**Phase 2: Scout Utility (Complete)**

The webhook scout utility has been built and used to capture real UniFi Protect webhook payloads from a live NVR. These fixtures power our test-driven development cycle going forward.

### Tech Stack
*   **Runtime:** Node.js (Latest LTS)
*   **Language:** TypeScript (ESM)
*   **Validation:** Zod (Environment & Webhook payloads)
*   **Logging:** Winston (JSON/Console support)
*   **Testing:** Vitest + MSW
*   **Linting:** ESLint (Flat Config) + Prettier

### Implemented Features
*   ✅ **Robust Configuration:** Zod-validated environment variables ensuring safe startup.
*   ✅ **Structured Logging:** Configurable logging levels with `DEBUG` toggle.
*   ✅ **Modern Tooling:** Full build pipeline with TypeScript and ESLint 9+.

---

## 🛠️ Getting Started

### Prerequisites
*   Node.js (v20+ recommended)
*   npm or yarn

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd unifi_video_archiver
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Copy the example configuration and update with your NVR details.
    ```bash
    cp .env.example .env
    ```
    > **Note:** For MVP, only `STORAGE_TYPE=fs` is supported.

### Development Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Run the application in development mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Run code quality checks |
| `npm test` | Run unit tests with Vitest |
| `npm run scout` | Run the webhook scout utility to capture live events |

---

## 🗺️ Roadmap

We are following a phased implementation plan.

| Phase | Status | Goal |
| :--- | :--- | :--- |
| **1. Project Scaffolding** | ✅ **Done** | Setup TS, ESLint, Zod, Logger. |
| **2. Scout Utility** | ✅ **Done** | Webhook listener captures real NVR events as test fixtures. |
| **3. Core Utilities** | 🚧 **Next** | TDD for time window calculations and file naming. |
| **4. UniFi Client** | ⏳ Planned | Authenticated API client (using `unifi-protect` lib). |
| **5. Storage Layer** | ⏳ Planned | FileSystem provider (Stream-to-disk). |
| **6. Orchestrator** | ⏳ Planned | Wire Webhook -> Client -> Storage. |
| **7. HTTP Server** | ⏳ Planned | Production-ready Express server. |
| **8. Hardening** | ⏳ Planned | Dockerization and deployment docs. |

---

## 📝 Configuration Reference

See `.env.example` for all available options.

```bash
# Capture Logic
CAPTURE_PRE_BUFFER_SECONDS=10  # Seconds to capture BEFORE event
CAPTURE_POST_BUFFER_SECONDS=20 # Seconds to capture AFTER event
SETTLING_DELAY_SECONDS=5       # Wait for NVR to flush to disk
```

## ⚠️ Known Limitations (MVP)
*   **Deduplication:** Overlapping motion events are not currently merged.
*   **Security:** Webhook endpoint assumes a private, trusted network (no signature verification).
*   **Storage:** Single storage provider active at a time.
