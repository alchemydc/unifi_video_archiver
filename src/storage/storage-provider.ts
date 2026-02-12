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
