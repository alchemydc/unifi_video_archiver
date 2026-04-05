import { isIP } from 'node:net';
import type { ProtectCameraConfig } from 'unifi-protect';
import { createUnifiClient } from '../clients/unifi-protect-client.js';

interface DeviceRow {
    camera: string;
    ip: string;
    hostname: string;
    mac: string;
}

function normalizeDeviceRow(camera: ProtectCameraConfig): DeviceRow {
    const candidates = [camera.host, camera.connectionHost]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    const ip = candidates.find(value => isIP(value) !== 0) ?? '-';
    const hostname = candidates.find(value => isIP(value) === 0) ?? '-';

    return {
        camera: camera.name ?? camera.id,
        ip,
        hostname,
        mac: camera.mac,
    };
}

async function main(): Promise<void> {
    const client = createUnifiClient();
    let exitCode = 0;

    try {
        await client.connect();

        const rows = client.getBootstrapCameras()
            .map(normalizeDeviceRow)
            .sort((left, right) => left.camera.localeCompare(right.camera));

        if (rows.length === 0) {
            console.log('No cameras found in UniFi Protect bootstrap');
            return;
        }

        console.table(rows);
    } catch (error) {
        console.error('Failed to enumerate UniFi Protect cameras:', error);
        exitCode = 1;
    } finally {
        client.disconnect();
        process.exit(exitCode);
    }
}

void main();