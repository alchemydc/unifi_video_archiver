import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { logger } from '../config/logger.js';
import type { IStorageProvider, StorageResult } from './storage-provider.js';

/**
 * FileSystemProvider implements IStorageProvider for local disk storage.
 * It uses atomic writes (.tmp files renamed on success) to prevent partial files.
 */
export class FileSystemProvider implements IStorageProvider {
    constructor(private readonly outputDir: string) { }

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
            try {
                await unlink(tmpPath);
            } catch {
                /* ignore cleanup errors */
            }
            throw error;
        }
    }

    /**
     * Helper to derive a YYYY-MM-DD directory string from a timestamp.
     */
    private getDateDirectory(timestamp: number): string {
        const date = new Date(timestamp);
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
}
