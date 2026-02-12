import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WebhookPayload } from '../schemas/webhook.schema.js';
import { logger } from '../config/logger.js';

const DEFAULT_FIXTURES_DIR = 'test/fixtures';

/**
 * Saves a validated webhook payload to a timestamped JSON file in the test/fixtures directory.
 */
export async function saveFixture(payload: WebhookPayload, directory: string = DEFAULT_FIXTURES_DIR): Promise<string> {
    await mkdir(directory, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `webhook-${timestamp}.json`;
    const filepath = join(directory, filename);

    await writeFile(filepath, JSON.stringify(payload, null, 2));
    logger.info(`Fixture saved: ${filepath}`);

    return filepath;
}
