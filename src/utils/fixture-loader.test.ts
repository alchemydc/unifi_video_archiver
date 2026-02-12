import { describe, it, expect } from 'vitest';
import { loadFixture, loadAllFixtures } from './fixture-loader.js';
import { webhookPayloadSchema } from '../schemas/webhook.schema.js';

describe('fixtureLoader', () => {
    it('should load a single fixture and validate against schema', () => {
        // We know this file exists from the list_dir output
        const fixture = loadFixture('webhook-2026-02-11T20-01-48-484Z.json');

        expect(fixture.alarm.name).toBe('Barking');
        expect(webhookPayloadSchema.safeParse(fixture).success).toBe(true);
    });

    it('should load all fixtures from the directory', () => {
        const allFixtures = loadAllFixtures();

        expect(allFixtures.length).toBeGreaterThanOrEqual(8);
        allFixtures.forEach(fixture => {
            expect(webhookPayloadSchema.safeParse(fixture).success).toBe(true);
        });
    });
});
