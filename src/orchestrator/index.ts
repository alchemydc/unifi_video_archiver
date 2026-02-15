import { env } from '../config/env.schema.js';
import { CaptureOrchestrator } from './capture-orchestrator.js';
import type { UnifiProtectClient } from '../clients/unifi-protect-client.js';
import type { IStorageProvider } from '../storage/storage-provider.js';

/**
 * Factory to create a CaptureOrchestrator from environment configuration.
 */
export function createOrchestrator(
    client: UnifiProtectClient,
    storage: IStorageProvider,
): CaptureOrchestrator {
    return new CaptureOrchestrator(
        client,
        storage,
        env.SETTLING_DELAY_SECONDS * 1000,
        env.CAPTURE_PRE_BUFFER_SECONDS,
        env.CAPTURE_POST_BUFFER_SECONDS,
        {
            maxRetries: env.RETRY_MAX_ATTEMPTS,
            initialDelayMs: env.RETRY_INITIAL_DELAY_MS,
            backoffMultiplier: env.RETRY_BACKOFF_MULTIPLIER,
            maxDelayMs: env.RETRY_MAX_DELAY_MS,
        },
    );
}

export { CaptureOrchestrator } from './capture-orchestrator.js';
