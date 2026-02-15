import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry.js';

// Suppress logger output during tests
vi.mock('../config/logger.js', () => ({
    logger: {
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
}));

describe('withRetry', () => {
    it('should return immediately on first success', async () => {
        const fn = vi.fn().mockResolvedValue('ok');

        const result = await withRetry(fn, { maxRetries: 3 });

        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed after transient failures', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockResolvedValue('ok');

        const result = await withRetry(fn, {
            maxRetries: 3,
            initialDelayMs: 1,
            backoffMultiplier: 1,
            maxDelayMs: 1,
        });

        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw the last error after exhausting retries', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

        await expect(
            withRetry(fn, {
                maxRetries: 2,
                initialDelayMs: 1,
                backoffMultiplier: 1,
                maxDelayMs: 1,
            }),
        ).rejects.toThrow('persistent failure');

        expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should respect maxRetries limit', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        await expect(
            withRetry(fn, {
                maxRetries: 1,
                initialDelayMs: 1,
                backoffMultiplier: 1,
                maxDelayMs: 1,
            }),
        ).rejects.toThrow('fail');

        expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('should cap delay at maxDelayMs', async () => {
        vi.useFakeTimers();

        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValue('ok');

        const promise = withRetry(fn, {
            maxRetries: 1,
            initialDelayMs: 50000,  // Way over the cap
            backoffMultiplier: 2,
            maxDelayMs: 100,
        });

        // The delay should be capped at ~100ms (±20% jitter → max 120ms)
        await vi.advanceTimersByTimeAsync(150);

        const result = await promise;
        expect(result).toBe('ok');

        vi.useRealTimers();
    });

    it('should work with zero retries (no retry at all)', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        await expect(withRetry(fn, { maxRetries: 0 }))
            .rejects.toThrow('fail');

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff between retries', async () => {
        vi.useFakeTimers();

        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockResolvedValue('ok');

        // Use fixed jitter by mocking Math.random to return 0.5 (zero jitter)
        vi.spyOn(Math, 'random').mockReturnValue(0.5);

        const promise = withRetry(fn, {
            maxRetries: 3,
            initialDelayMs: 100,
            backoffMultiplier: 2,
            maxDelayMs: 10000,
        });

        // First retry: 100ms * 2^0 = 100ms (jitter=0 when random=0.5)
        expect(fn).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(100);
        expect(fn).toHaveBeenCalledTimes(2);

        // Second retry: 100ms * 2^1 = 200ms
        await vi.advanceTimersByTimeAsync(200);
        expect(fn).toHaveBeenCalledTimes(3);

        const result = await promise;
        expect(result).toBe('ok');

        vi.restoreAllMocks();
        vi.useRealTimers();
    });
});
