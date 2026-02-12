import { describe, it, expect } from 'vitest';
import { generateClipFilename } from './file-name.js';
import { loadFixture } from './fixture-loader.js';
import type { WebhookPayload } from '../schemas/webhook.schema.js';

describe('generateClipFilename', () => {
    it('should generate a safe filename from a real fixture', () => {
        const fixture = loadFixture('webhook-2026-02-11T20-01-48-484Z.json');
        // alarm: { name: "Barking", ... triggers: [{ key: "audio_alarm_bark", ... }] }
        // timestamp: 1770840108431 -> 2026-02-11T20:01:48.431Z (approx - wait, the user says the example fixture timestamp is 1770840108431)
        // Let's check the actually expected ISO string for that timestamp.
        const filename = generateClipFilename(fixture);

        expect(filename).toContain('barking');
        expect(filename).toContain('audio-alarm-bark');
        expect(filename).toMatch(/barking_audio-alarm-bark_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.mp4/);
    });

    it('should sanitize alarm names with special characters and spaces', () => {
        const payload = {
            alarm: {
                name: 'My Custom Alert! @#$',
                triggers: [{ key: 'motion', device: '123' }]
            },
            timestamp: 1676149200000
        } as unknown as WebhookPayload;

        const filename = generateClipFilename(payload);
        expect(filename).toContain('my-custom-alert');
        expect(filename).not.toContain('!');
        expect(filename).not.toContain('@');
        expect(filename).not.toContain('#');
        expect(filename).not.toContain('$');
    });

    it('should fallback to unknown key if no triggers are present', () => {
        const payload = {
            alarm: {
                name: 'Test',
                triggers: []
            },
            timestamp: 1676149200000
        } as unknown as WebhookPayload;

        const filename = generateClipFilename(payload);
        expect(filename).toContain('test_unknown_');
    });

    it('should sanitize trigger keys', () => {
        const payload = {
            alarm: {
                name: 'Test',
                triggers: [{ key: 'motion_detected_v2', device: '123' }]
            },
            timestamp: 1676149200000
        } as unknown as WebhookPayload;

        const filename = generateClipFilename(payload);
        expect(filename).toContain('motion-detected-v2');
    });
});
