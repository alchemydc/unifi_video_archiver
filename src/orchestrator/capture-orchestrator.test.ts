import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CaptureOrchestrator } from './capture-orchestrator.js';
import { Readable } from 'node:stream';
import type { WebhookPayload } from '../schemas/webhook.schema.js';
import type { UnifiProtectClient } from '../clients/unifi-protect-client.js';
import type { IStorageProvider } from '../storage/storage-provider.js';

// Build a valid payload for testing
const makePayload = (overrides?: Partial<WebhookPayload>): WebhookPayload => ({
    alarm: {
        name: 'Barking Dog Alert',
        triggers: [{ key: 'motion', device: 'A89C6C487E19' }],
    },
    timestamp: 1770840108431,
    ...overrides,
});

describe('CaptureOrchestrator', () => {
    let mockClient: { findCameraByMac: ReturnType<typeof vi.fn>; exportVideoClip: ReturnType<typeof vi.fn> };
    let mockStorage: { save: ReturnType<typeof vi.fn> };
    let orchestrator: CaptureOrchestrator;

    beforeEach(() => {
        vi.useFakeTimers();
        mockClient = {
            findCameraByMac: vi.fn().mockReturnValue({ id: 'cam-uuid-1', name: 'Front Door', mac: 'A89C6C487E19' }),
            exportVideoClip: vi.fn(async () => Readable.from([Buffer.from('fake mp4 data')])),
        };
        mockStorage = {
            save: vi.fn(async () => ({ location: '/clips/2026-02-11/barking-dog-alert_motion_2026-02-11T20-01-48Z.mp4', sizeBytes: 13 })),
        };
        // Use 0ms settling delay by default for speed
        orchestrator = new CaptureOrchestrator(
            mockClient as unknown as UnifiProtectClient,
            mockStorage as unknown as IStorageProvider,
            0, 10, 20,
            { maxRetries: 0, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1 },
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should process a webhook through the full pipeline successfully', async () => {
        const payload = makePayload();
        const result = await orchestrator.handleWebhook(payload);

        // Verify camera lookup
        expect(mockClient.findCameraByMac).toHaveBeenCalledWith('A89C6C487E19');

        // Verify video export
        expect(mockClient.exportVideoClip).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cam-uuid-1' }),
            expect.objectContaining({
                start: payload.timestamp - 10000,
                end: payload.timestamp + 20000
            })
        );

        // Verify storage save
        expect(mockStorage.save).toHaveBeenCalledWith(
            expect.any(Readable),
            expect.stringContaining('barking-dog-alert'),
            payload.timestamp
        );

        expect(result.location).toContain('barking-dog-alert');
    });

    it('should throw if no trigger device is found in the payload', async () => {
        const payload = makePayload({ alarm: { name: 'Empty Triggers', triggers: [] } as unknown as WebhookPayload['alarm'] });

        await expect(orchestrator.handleWebhook(payload))
            .rejects.toThrow('No trigger device found');
    });

    it('should throw if camera is not found by MAC', async () => {
        mockClient.findCameraByMac.mockReturnValue(null);
        const payload = makePayload();

        await expect(orchestrator.handleWebhook(payload))
            .rejects.toThrow('Camera not found for MAC: A89C6C487E19');
    });

    it('should propagate errors from the UniFi client', async () => {
        mockClient.exportVideoClip.mockRejectedValue(new Error('NVR Offline'));
        const payload = makePayload();

        await expect(orchestrator.handleWebhook(payload))
            .rejects.toThrow('NVR Offline');
    });

    it('should propagate errors from the storage provider', async () => {
        mockStorage.save.mockRejectedValue(new Error('Disk Full'));
        const payload = makePayload();

        await expect(orchestrator.handleWebhook(payload))
            .rejects.toThrow('Disk Full');
    });

    it('should respect the settling delay if configured', async () => {
        const settlingDelayMs = 5000;
        orchestrator = new CaptureOrchestrator(
            mockClient as unknown as UnifiProtectClient,
            mockStorage as unknown as IStorageProvider,
            settlingDelayMs, 10, 20,
            { maxRetries: 0, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1 },
        );

        const payload = makePayload();
        const promise = orchestrator.handleWebhook(payload);

        // It should be waiting
        expect(mockClient.exportVideoClip).not.toHaveBeenCalled();

        // Advance time
        await vi.advanceTimersByTimeAsync(settlingDelayMs);

        await promise;
        expect(mockClient.exportVideoClip).toHaveBeenCalled();
    });

    it('should retry video export on transient NVR error and succeed', async () => {
        vi.useRealTimers();

        mockClient.exportVideoClip
            .mockRejectedValueOnce(new Error('No response from NVR'))
            .mockImplementation(async () => Readable.from([Buffer.from('fake mp4 data')]));

        orchestrator = new CaptureOrchestrator(
            mockClient as unknown as UnifiProtectClient,
            mockStorage as unknown as IStorageProvider,
            0, 10, 20,
            { maxRetries: 2, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1 },
        );

        const payload = makePayload();
        const result = await orchestrator.handleWebhook(payload);

        expect(result.location).toContain('barking-dog-alert');
        expect(mockClient.exportVideoClip).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting all export retries', async () => {
        vi.useRealTimers();

        mockClient.exportVideoClip.mockRejectedValue(new Error('NVR permanently offline'));

        orchestrator = new CaptureOrchestrator(
            mockClient as unknown as UnifiProtectClient,
            mockStorage as unknown as IStorageProvider,
            0, 10, 20,
            { maxRetries: 1, initialDelayMs: 1, backoffMultiplier: 1, maxDelayMs: 1 },
        );

        const payload = makePayload();

        await expect(orchestrator.handleWebhook(payload))
            .rejects.toThrow('NVR permanently offline');
        expect(mockClient.exportVideoClip).toHaveBeenCalledTimes(2);
    });
});
