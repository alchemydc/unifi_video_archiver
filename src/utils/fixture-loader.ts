import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { webhookPayloadSchema, type WebhookPayload } from '../schemas/webhook.schema.js';

const FIXTURES_DIR = join(process.cwd(), 'test', 'fixtures');

/**
 * Loads a single fixture by filename.
 */
export function loadFixture(filename: string): WebhookPayload {
    const filePath = join(FIXTURES_DIR, filename);
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return webhookPayloadSchema.parse(data);
}

/**
 * Loads all fixtures from the test/fixtures directory.
 */
export function loadAllFixtures(): WebhookPayload[] {
    const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
    return files.map(loadFixture);
}
