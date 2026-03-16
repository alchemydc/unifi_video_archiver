# Deployment Guide

## Overview

The service is designed to run on a trusted private network that can reach both your UniFi Protect NVR and the system where archived clips are stored.

## Prerequisites

- Docker Engine with the Compose plugin
- Network reachability from the container host to `UNIFI_HOST`
- A writable host directory for archived clips

## Configure the Environment

Create a `.env` file from `.env.example` and fill in the UniFi Protect credentials and timing settings.

```bash
cp .env.example .env
```

The Compose stack loads variables from `.env` and binds `./clips` on the host to `/app/clips` in the container.

## Start with Docker Compose

Build and start the service:

```bash
docker compose up -d --build
```

Inspect logs:

```bash
docker compose logs -f
```

Stop the stack:

```bash
docker compose down
```

## Run the Container Directly

Build the image:

```bash
docker build -t unifi-video-archiver .
```

Run it with an env file and persistent clip storage:

```bash
docker run -d \
  --name unifi-video-archiver \
  --restart unless-stopped \
  --env-file .env \
  -p 3000:3000 \
  -v "$PWD/clips:/app/clips" \
  unifi-video-archiver
```

## Operations

- Health check: `GET /health`
- Webhook endpoint: `POST /webhook`
- Archived clips: host `./clips`, container `/app/clips`

## Upgrade Workflow

Pull the latest code, then rebuild and restart:

```bash
docker compose up -d --build
```

Existing archives remain intact because clip storage is mounted from the host.

## Deployment Notes

- Keep the webhook listener on a private network. There is no request signing or webhook authentication in the current MVP.
- Avoid ephemeral container storage for archives. Always mount a host path or managed volume.
- The app retries initial NVR connection and other guarded operations, but it does not yet implement a durable job queue or replay mechanism.
