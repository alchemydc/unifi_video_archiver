import { describe, it, expect } from 'vitest';
import { computeTimeWindow } from './time-window.js';
import { loadFixture } from './fixture-loader.js';

describe('computeTimeWindow', () => {
    it('should calculate standard pre- and post-buffers', () => {
        const fixture = loadFixture('webhook-2026-02-11T20-01-48-484Z.json');
        const timestamp = fixture.timestamp; // 1770840108431

        const preBuffer = 10;
        const postBuffer = 20;

        const window = computeTimeWindow(timestamp, preBuffer, postBuffer);

        expect(window.start).toBe(timestamp - 10000);
        expect(window.end).toBe(timestamp + 20000);
    });

    it('should handle zero buffers', () => {
        const timestamp = 1000000;
        const window = computeTimeWindow(timestamp, 0, 0);

        expect(window.start).toBe(timestamp);
        expect(window.end).toBe(timestamp);
    });

    it('should throw error for non-positive timestamp', () => {
        expect(() => computeTimeWindow(0, 10, 20)).toThrow('Invalid event timestamp');
        expect(() => computeTimeWindow(-1, 10, 20)).toThrow('Invalid event timestamp');
    });
});
