import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemProvider } from './filesystem-provider.js';
import { Readable } from 'node:stream';
import { readFile, rm, access } from 'node:fs/promises';
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

    it('should perform an atomic write (no .tmp file remains)', async () => {
        const content = Buffer.from('data');
        const stream = Readable.from([content]);
        const timestamp = Date.now();
        const filename = 'atomic-test.mp4';

        const result = await provider.save(stream, filename, timestamp);
        const tmpPath = `${result.location}.tmp`;

        // Final file exists
        await expect(access(result.location)).resolves.toBeUndefined();
        // Tmp file does not
        await expect(access(tmpPath)).rejects.toThrow();
    });

    it('should clean up .tmp file if the stream throws an error', async () => {
        const errorStream = new Readable({
            read() {
                this.destroy(new Error('Stream failure'));
            }
        });
        const filename = 'error-test.mp4';
        const timestamp = Date.now();

        await expect(provider.save(errorStream, filename, timestamp))
            .rejects.toThrow('Stream failure');

        const date = new Date(timestamp);
        const dateDir = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
        const finalPath = join(TEST_OUTPUT_DIR, dateDir, filename);
        const tmpPath = `${finalPath}.tmp`;

        // Neither final nor tmp file should exist
        await expect(access(finalPath)).rejects.toThrow();
        await expect(access(tmpPath)).rejects.toThrow();
    });

    it('should create nested directories if they do not exist', async () => {
        const content = Buffer.from('nested');
        const stream = Readable.from([content]);
        const timestamp = Date.now();

        // Use a deeper path for TEST_OUTPUT_DIR to ensure recursion
        const deeperDir = join(TEST_OUTPUT_DIR, 'level1', 'level2');
        const deeperProvider = new FileSystemProvider(deeperDir);

        const result = await deeperProvider.save(stream, 'nested.mp4', timestamp);
        expect(result.location).toContain(deeperDir);
        await expect(access(result.location)).resolves.toBeUndefined();
    });
});
