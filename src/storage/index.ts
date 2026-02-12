import { env } from '../config/env.schema.js';
import { FileSystemProvider } from './filesystem-provider.js';
import type { IStorageProvider } from './storage-provider.js';

/**
 * Factory to create the configured storage provider.
 */
export function createStorageProvider(): IStorageProvider {
    switch (env.STORAGE_TYPE) {
        case 'fs':
            return new FileSystemProvider(env.OUTPUT_DIR);
        default:
            throw new Error(`Unsupported storage type: ${env.STORAGE_TYPE}. Only 'fs' is supported in MVP.`);
    }
}

export type { IStorageProvider, StorageResult } from './storage-provider.js';
