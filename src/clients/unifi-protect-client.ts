import { ProtectApi } from 'unifi-protect';
import type { ProtectCameraConfig } from 'unifi-protect';
import { Readable } from 'node:stream';
import { protectLogger } from '../config/protect-logging-adapter.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.schema.js';
import type { TimeWindow } from '../utils/time-window.js';

export class UnifiProtectClient {
    private api: ProtectApi;
    private host: string;
    private username: string;
    private password: string;

    constructor(host: string, username: string, password: string) {
        this.host = host;
        this.username = username;
        this.password = password;
        this.api = new ProtectApi(protectLogger);
    }

    /**
     * Login and bootstrap the UniFi Protect API.
     * Throws an error on failure.
     */
    async connect(): Promise<void> {
        if (!await this.api.login(this.host, this.username, this.password)) {
            throw new Error('UniFi Protect login failed');
        }

        if (!await this.api.getBootstrap()) {
            throw new Error('UniFi Protect bootstrap failed');
        }

        const cameras = this.api.bootstrap?.cameras ?? [];
        logger.info(`Connected to NVR: ${this.api.name}, ${cameras.length} cameras found`);
    }

    /**
     * Find a camera by its MAC address.
     * Webhook payloads contain normalized MACs without colons.
     */
    findCameraByMac(mac: string): ProtectCameraConfig | null {
        const normalizedMac = mac.replace(/[: -]/g, '').toUpperCase();
        const cameras = this.api.bootstrap?.cameras ?? [];

        return cameras.find(cam => {
            const camMac = cam.mac.replace(/[: -]/g, '').toUpperCase();
            return camMac === normalizedMac;
        }) ?? null;
    }

    /**
     * Export a video clip for the given camera and time window.
     * Returns a Node.js Readable stream of MP4 bytes.
     * Throws an error on failure or session expiration (401).
     */
    async exportVideoClip(camera: ProtectCameraConfig, timeWindow: TimeWindow): Promise<Readable> {
        const url = `https://${this.host}/proxy/protect/api/video/export?camera=${camera.id}&start=${timeWindow.start}&end=${timeWindow.end}`;

        const response = await this.api.retrieve(url, { method: 'GET' }, { timeout: 60000 });

        if (!response) {
            throw new Error('Video export failed: No response from NVR');
        }

        if (!this.api.responseOk(response.statusCode)) {
            throw new Error(`Video export failed: HTTP ${response.statusCode}`);
        }

        // undici ResponseData.body is an AsyncIterable, wrap as Readable
        return Readable.from(response.body);
    }

    /**
     * Clean shutdown of the API client.
     */
    disconnect(): void {
        this.api.reset();
    }
}

/**
 * Convenience factory to create a UniFi client from environment configuration.
 */
export function createUnifiClient(): UnifiProtectClient {
    return new UnifiProtectClient(env.UNIFI_HOST, env.UNIFI_USER, env.UNIFI_PASS);
}
