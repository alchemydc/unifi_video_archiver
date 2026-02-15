import { logger } from '../config/logger.js';

export interface RetryOptions {
    /** Maximum number of retry attempts (not counting the initial attempt). */
    maxRetries: number;
    /** Delay in ms before the first retry. */
    initialDelayMs: number;
    /** Multiplier applied to the delay after each retry. */
    backoffMultiplier: number;
    /** Maximum delay cap in ms. */
    maxDelayMs: number;
    /** Label for log messages (e.g. the operation name). */
    label?: string;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 15000,
};

/**
 * Execute an async function with exponential backoff retry.
 * Jitter of ±20% is added to each delay to prevent thundering herd.
 *
 * @param fn - The async function to execute.
 * @param options - Retry configuration.
 * @returns The resolved value of `fn`.
 * @throws The error from the last attempt if all retries are exhausted.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {},
): Promise<T> {
    const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
    const tag = opts.label ? `[${opts.label}] ` : '';

    let lastError: unknown;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            if (attempt >= opts.maxRetries) {
                break;
            }

            // Calculate delay with exponential backoff
            const baseDelay = Math.min(
                opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
                opts.maxDelayMs,
            );

            // Add ±20% jitter
            const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
            const delay = Math.round(baseDelay + jitter);

            const message = err instanceof Error ? err.message : String(err);
            logger.warn(
                `${tag}Attempt ${attempt + 1}/${opts.maxRetries + 1} failed: ${message}. ` +
                `Retrying in ${delay}ms...`,
            );

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}
