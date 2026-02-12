# Phase 5: Storage Layer — Detailed Implementation Plan

## Objective

Build a storage abstraction using the Strategy Pattern, with a `FileSystemProvider` as the MVP implementation. The provider accepts a Node.js `Readable` stream (from `exportVideoClip()`) and writes it to disk in date-organized directories.

---

## Prerequisites

| Requirement | Status |
|-------------|--------|
| Phase 4 complete (`UnifiProtectClient.exportVideoClip()` returns `Readable`) | ✅ |
| `generateClipFilename()` utility | ✅ In `src/utils/file-name.ts` |
| `OUTPUT_DIR` env var | ✅ In `env.schema.ts`, defaults to `./clips` |
| `STORAGE_TYPE` env var | ✅ In `env.schema.ts`, defaults to `fs` |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Strategy Pattern** | `IStorageProvider` interface allows drop-in S3/R2 providers later |
| **Atomic writes** | Write to a `.tmp` file, rename on completion — avoids partial files on crash |
| **YYYY-MM-DD subdirectories** | Organizes clips by date for easy browsing and retention management |
| **Stream piping** | Zero-copy: `Readable.pipe(writeStream)` — memory stays flat regardless of file size |
| **Node `Readable` input** | Matches the output of `UnifiProtectClient.exportVideoClip()` |

---

## Task Breakdown

### 5.1 Create `IStorageProvider` Interface

**File:** `src/storage/storage-provider.ts` [NEW]

Define the contract that all storage backends must implement.

```typescript
import { Readable } from 'node:stream';

export interface StorageResult {
    /** Absolute path or remote URL of the saved file */
    location: string;
    /** Size in bytes */
    sizeBytes: number;
}

export interface IStorageProvider {
    /**
     * Save a video stream to storage.
     * @param stream  - Readable stream of MP4 bytes
     * @param filename - Desired filename (from FileNameUtil)  
     * @param timestamp - Event timestamp (used for directory organization)
     * @returns StorageResult with location and size
     */
    save(stream: Readable, filename: string, timestamp: number): Promise<StorageResult>;
}
```

---

### 5.2 Implement `FileSystemProvider`

**File:** `src/storage/filesystem-provider.ts` [NEW]

The MVP storage backend that writes clips to local disk.

**Steps:**
1. Import `node:fs`, `node:path`, and `node:stream/promises` (`pipeline`)
2. Accept `outputDir` in the constructor
3. Implement `save()`:
   - Derive a date directory: `YYYY-MM-DD` from the event `timestamp`
   - Ensure the directory exists: `mkdirSync(dateDir, { recursive: true })`
   - Build the tmp path: `path.join(dateDir, filename + '.tmp')`
   - Build the final path: `path.join(dateDir, filename)`
   - Pipe the stream to a write stream at the tmp path using `pipeline()`
   - On success, rename `.tmp` → final file (`rename()`)
   - On failure, attempt to clean up the `.tmp` file
   - Return `{ location: finalPath, sizeBytes }` using `stat()`

**Code:**

```typescript
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { logger } from '../config/logger.js';
import type { IStorageProvider, StorageResult } from './storage-provider.js';

export class FileSystemProvider implements IStorageProvider {
    constructor(private readonly outputDir: string) {}

    async save(stream: Readable, filename: string, timestamp: number): Promise<StorageResult> {
        const dateDir = this.getDateDirectory(timestamp);
        const dir = join(this.outputDir, dateDir);
        await mkdir(dir, { recursive: true });

        const tmpPath = join(dir, `${filename}.tmp`);
        const finalPath = join(dir, filename);

        try {
            await pipeline(stream, createWriteStream(tmpPath));
            await rename(tmpPath, finalPath);
            const { size } = await stat(finalPath);
            logger.info(`Saved clip: ${finalPath} (${size} bytes)`);
            return { location: finalPath, sizeBytes: size };
        } catch (error) {
            // Attempt to clean up partial temp file
            try { await unlink(tmpPath); } catch { /* ignore cleanup errors */ }
            throw error;
        }
    }

    private getDateDirectory(timestamp: number): string {
        const date = new Date(timestamp);
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
}
```

---

### 5.3 Create a Factory Function

**File:** `src/storage/index.ts` [NEW]

Reads `STORAGE_TYPE` from env and returns the correct provider. For MVP, only `fs` is supported.

```typescript
import { env } from '../config/env.schema.js';
import { FileSystemProvider } from './filesystem-provider.js';
import type { IStorageProvider } from './storage-provider.js';

export function createStorageProvider(): IStorageProvider {
    switch (env.STORAGE_TYPE) {
        case 'fs':
            return new FileSystemProvider(env.OUTPUT_DIR);
        default:
            throw new Error(`Unsupported storage type: ${env.STORAGE_TYPE}. Only 'fs' is supported in MVP.`);
    }
}

export type { IStorageProvider, StorageResult } from './storage-provider.js';
```

---

### 5.4 Write Unit Tests

**File:** `src/storage/filesystem-provider.test.ts` [NEW]

Tests use a temporary directory (`test/clips-test`) to avoid polluting the real output directory. Use `beforeEach`/`afterEach` to create and clean up the temp directory.

**Test cases:**

| # | Test | What to Assert |
|---|------|---------------|
| 1 | Saves a stream to disk | File exists at expected path, `sizeBytes > 0`, content matches |
| 2 | Creates YYYY-MM-DD subdirectory | Directory name derived from timestamp |
| 3 | Atomic write (no `.tmp` leftover) | After `save()`, only the final file exists, no `.tmp` |
| 4 | Handles stream error | If the input `Readable` emits an error, `save()` throws, `.tmp` is cleaned up |
| 5 | Creates nested directories | Works on first call when output dir doesn't exist yet |

**Test pattern:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemProvider } from './filesystem-provider.js';
import { Readable } from 'node:stream';
import { readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const TEST_OUTPUT_DIR = 'test/clips-test';

describe('FileSystemProvider', () => {
    let provider: FileSystemProvider;

    beforeEach(async () => {
        await rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
        provider = new FileSystemProvider(TEST_OUTPUT_DIR);
    });

    afterEach(async () => {
        await rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
    });

    it('should save a stream to a date-organized directory', async () => {
        const content = Buffer.from('fake mp4 data');
        const stream = Readable.from([content]);
        // timestamp for 2026-02-11
        const timestamp = 1770840108431;

        const result = await provider.save(stream, 'test-clip.mp4', timestamp);

        expect(result.location).toContain('2026-02-11');
        expect(result.location).toContain('test-clip.mp4');
        expect(result.sizeBytes).toBe(content.length);

        const saved = await readFile(result.location);
        expect(saved).toEqual(content);
    });

    // ... additional test cases
});
```

**File:** `src/storage/index.test.ts` [NEW]

| # | Test | What to Assert |
|---|------|---------------|
| 1 | Factory returns `FileSystemProvider` for `STORAGE_TYPE=fs` | `createStorageProvider()` returns an instance |
| 2 | Factory throws for unsupported type | Mock `env.STORAGE_TYPE = 'gcs'` → throws error |

---

## File Structure After Phase 5

```
src/
├── clients/
│   ├── unifi-protect-client.ts         # (existing)
│   └── unifi-protect-client.test.ts    # (existing)
├── config/
│   ├── env.schema.ts                   # (existing)
│   ├── logger.ts                       # (existing)
│   └── protect-logging-adapter.ts      # (existing)
├── storage/                            # [NEW directory]
│   ├── storage-provider.ts             # [NEW] IStorageProvider interface
│   ├── filesystem-provider.ts          # [NEW] Local disk implementation
│   ├── filesystem-provider.test.ts     # [NEW] Unit tests
│   ├── index.ts                        # [NEW] Factory + re-exports
│   └── index.test.ts                   # [NEW] Factory tests
├── schemas/                            # (existing)
├── utils/                              # (existing)
└── index.ts                            # (existing)
```

---

## Implementation Order

Execute in this exact order:

1. **5.1** — `storage-provider.ts` (interface only, no dependencies)
2. **5.2** — `filesystem-provider.ts` (depends on 5.1)
3. **5.3** — `index.ts` factory (depends on 5.2)
4. **5.4** — Tests for both `filesystem-provider` and factory

---

## Verification Plan

### Automated Tests
```bash
npm run build        # TypeScript compiles without errors
npm run lint         # No lint errors
npm run test         # All tests pass (new + existing)
npm run test:coverage # Verify >90% coverage for new files
```

### Manual Smoke Test (Optional)

Create a quick script to verify end-to-end stream-to-disk:

```typescript
import { FileSystemProvider } from '../storage/filesystem-provider.js';
import { Readable } from 'node:stream';

const provider = new FileSystemProvider('./clips');
const stream = Readable.from([Buffer.from('test video data')]);
const result = await provider.save(stream, 'manual-test.mp4', Date.now());
console.log('Saved to:', result.location, `(${result.sizeBytes} bytes)`);
```

Add to package.json as `test-storage` script:
```json
"test-storage": "node --loader ts-node/esm src/bin/test-storage.ts"
```

Run:
```bash
npm run test-storage
```

---

## Edge Cases & Gotchas

| Issue | Mitigation |
|-------|------------|
| Disk full during write | `pipeline()` will throw an `ENOSPC` error; the `.tmp` file is cleaned up in the `catch` block |
| Duplicate filenames | `generateClipFilename()` includes a per-second timestamp, making collisions extremely unlikely |
| Permission errors on output dir | Fail fast with clear error from `mkdir()` |
| Stream error mid-write | `pipeline()` propagates errors; `.tmp` cleanup prevents partial files |
| Windows path separators | Use `node:path.join()` everywhere — handles cross-platform automatically |
