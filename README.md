# UniFi Video Archiver

Node.js service that receives UniFi Protect Alarm Manager webhooks and archives the corresponding video clips to local storage.

## Status

Phase 8 is complete. The project now includes a production container image, a Compose deployment, and deployment documentation in [docs/deployment.md](/Users/dc/Projects/unifi_video_archiver/docs/deployment.md).

## Requirements

- Node.js 22 or newer for local development
- npm
- Network access to the UniFi Protect NVR from the machine or container running this service

## Local Setup

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Set the required UniFi Protect values in `.env`:

```bash
UNIFI_HOST=192.168.1.1
UNIFI_USER=admin
UNIFI_PASS=secret
```

Start the service in development mode:

```bash
npm run dev
```

Build and run the compiled app:

```bash
npm run build
npm start
```

## Docker Deployment

Start the service with Docker Compose:

```bash
docker compose up -d --build
```

The default Compose stack:

- loads variables from `.env`
- exposes port `3000`
- persists archived clips in `./clips`

For direct `docker run` usage and operational notes, see [docs/deployment.md](/Users/dc/Projects/unifi_video_archiver/docs/deployment.md).

## Runtime Endpoints

- `GET /health` returns service health and uptime
- `POST /webhook` accepts UniFi Protect Alarm Manager webhook payloads

In UniFi Protect Alarm Manager, configure the webhook action to use HTTP POST with the JSON payload body enabled.

## Configuration

See `.env.example` for the full configuration surface. The main options are:

```bash
LOG_LEVEL=info
STORAGE_TYPE=fs
OUTPUT_DIR=./clips
CAPTURE_PRE_BUFFER_SECONDS=10
CAPTURE_POST_BUFFER_SECONDS=20
SETTLING_DELAY_SECONDS=5
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY_MS=1000
RETRY_BACKOFF_MULTIPLIER=2
RETRY_MAX_DELAY_MS=15000
WEBHOOK_PORT=3000
```

`STORAGE_TYPE` currently validates `fs`, `r2`, and `s3`, but only the local filesystem provider is implemented in this MVP.

## Useful Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Run the server from TypeScript sources |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the test suite |
| `npm run test:coverage` | Run tests with coverage |
| `npm run scout` | Capture webhook fixtures from live events |
| `npm run test-client` | Smoke test NVR connectivity |
| `npm run test-storage` | Smoke test filesystem storage |
| `npm run test-orchestrator` | Smoke test the full archive pipeline |

## Known Limitations

- No deduplication for overlapping motion events
- No webhook authentication or request signing
- No durable queue or replay for failed captures
- Only one storage provider active at a time
