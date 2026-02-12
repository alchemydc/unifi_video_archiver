import { logger } from '../config/logger.js';
import type { WebhookPayload } from '../schemas/webhook.schema.js';
import type { UnifiProtectClient } from '../clients/unifi-protect-client.js';
import type { IStorageProvider, StorageResult } from '../storage/storage-provider.js';
import { computeTimeWindow } from '../utils/time-window.js';
import { generateClipFilename } from '../utils/file-name.js';

/**
 * Helper to wrap setTimeout in a Promise.
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * CaptureOrchestrator coordinates the video archival pipeline.
 * It is stateless and relies on provided dependencies.
 */
export class CaptureOrchestrator {
    constructor(
        private readonly client: UnifiProtectClient,
        private readonly storage: IStorageProvider,
        private readonly settlingDelayMs: number,
        private readonly preBufferSeconds: number,
        private readonly postBufferSeconds: number,
    ) { }

    /**
     * Handles a validated webhook payload by executing the capture pipeline.
     * 1. Extracts camera
     * 2. Computes time window
     * 3. Waits for settling delay
     * 4. Exports video
     * 5. Saves to storage
     */
    async handleWebhook(payload: WebhookPayload): Promise<StorageResult> {
        // 1. Extract camera MAC from trigger
        const mac = payload.alarm.triggers?.[0]?.device;
        if (!mac) {
            throw new Error('No trigger device found in webhook payload');
        }

        // 2. Find camera
        const camera = this.client.findCameraByMac(mac);
        if (!camera) {
            throw new Error(`Camera not found for MAC: ${mac}`);
        }
        logger.info(`Processing event for camera: ${camera.name} (${mac})`);

        // 3. Compute time window
        const timeWindow = computeTimeWindow(
            payload.timestamp,
            this.preBufferSeconds,
            this.postBufferSeconds,
        );
        logger.debug(`Time window: ${new Date(timeWindow.start).toISOString()} → ${new Date(timeWindow.end).toISOString()}`);

        // 4. Generate filename
        const filename = generateClipFilename(payload);
        logger.debug(`Filename: ${filename}`);

        // 5. Settling delay
        if (this.settlingDelayMs > 0) {
            logger.info(`Waiting ${this.settlingDelayMs / 1000}s for NVR to flush video...`);
            await delay(this.settlingDelayMs);
        }

        // 6. Export video clip from NVR
        logger.info(`Exporting video clip from NVR for ${camera.name}...`);
        const stream = await this.client.exportVideoClip(camera, timeWindow);

        // 7. Save to storage
        logger.info(`Saving video clip to storage...`);
        const result = await this.storage.save(stream, filename, payload.timestamp);

        logger.info(`Clip successfully archived: ${result.location} (${result.sizeBytes} bytes)`);

        return result;
    }
}
