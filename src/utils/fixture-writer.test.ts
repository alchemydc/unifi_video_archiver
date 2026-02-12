import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { saveFixture } from './fixture-writer.js';
import type { WebhookPayload } from '../schemas/webhook.schema.js';

const FIXTURES_TEST_DIR = 'test/fixtures-test';

describe('saveFixture', () => {
    beforeEach(async () => {
        // Clean up test fixtures before each test
        await rm(FIXTURES_TEST_DIR, { recursive: true, force: true });
    });

    afterEach(async () => {
        // Clean up after tests
        await rm(FIXTURES_TEST_DIR, { recursive: true, force: true });
    });

    it('should create the fixtures directory and save the payload', async () => {
        const payload = {
            alarm: { name: 'Test Alarm' },
            timestamp: Date.now()
        } as unknown as WebhookPayload;

        const filepath = await saveFixture(payload, FIXTURES_TEST_DIR);
        expect(filepath).toContain(FIXTURES_TEST_DIR);
        expect(filepath).toContain('webhook-');
        expect(filepath).toMatch(/\.json$/);

        const content = await readFile(filepath, 'utf-8');
        const savedPayload = JSON.parse(content);
        expect(savedPayload).toEqual(payload);
    });

    it('should generate unique filenames based on timestamp', async () => {
        const payload = { alarm: { name: 'Test' }, timestamp: 123 } as unknown as WebhookPayload;

        // Mock Date to control filename
        const mockDate = new Date('2026-02-09T12:00:00.000Z');
        vi.useFakeTimers();
        vi.setSystemTime(mockDate);

        const filepath = await saveFixture(payload, FIXTURES_TEST_DIR);
        expect(filepath).toContain('2026-02-09T12-00-00-000Z');

        vi.useRealTimers();
    });
});
