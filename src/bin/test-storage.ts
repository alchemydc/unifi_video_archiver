import { FileSystemProvider } from '../storage/filesystem-provider.js';
import { Readable } from 'node:stream';

/**
 * Manual smoke test for FileSystemProvider.
 * Verifies end-to-end stream-to-disk writing with atomic rename and date partitioning.
 */
async function main() {
    try {
        const provider = new FileSystemProvider('./clips');
        const content = Buffer.from('test video data - ' + new Date().toISOString());
        const stream = Readable.from([content]);
        const timestamp = Date.now();
        const filename = 'manual-test.mp4';

        console.log(`Starting storage smoke test...`);
        const result = await provider.save(stream, filename, timestamp);

        console.log('Success!');
        console.log('Saved to:', result.location);
        console.log('Size:', result.sizeBytes, 'bytes');

        process.exit(0);
    } catch (error) {
        console.error('Storage smoke test failed:', error);
        process.exit(1);
    }
}

main();
