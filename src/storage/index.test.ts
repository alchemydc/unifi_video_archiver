import { describe, it, expect } from 'vitest';
import { createStorageProvider } from './index.js';
import { FileSystemProvider } from './filesystem-provider.js';
import { env } from '../config/env.schema.js';

describe('Storage Factory', () => {
    it('should return a FileSystemProvider when STORAGE_TYPE is fs', () => {
        // env.STORAGE_TYPE is 'fs' by default in env.schema.ts
        const provider = createStorageProvider();
        expect(provider).toBeInstanceOf(FileSystemProvider);
    });

    it('should throw for unsupported storage types', () => {
        // Temporarily override env.STORAGE_TYPE
        const originalType = env.STORAGE_TYPE;
        // @ts-expect-error - manipulating env for testing
        env.STORAGE_TYPE = 'invalid';

        try {
            expect(() => createStorageProvider()).toThrow('Unsupported storage type: invalid');
        } finally {
            // Restore
            env.STORAGE_TYPE = originalType;
        }
    });
});
