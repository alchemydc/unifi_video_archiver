import { createUnifiClient } from '../clients/unifi-protect-client.js';

/**
 * Manual smoke test for UnifiProtectClient.
 * Requires a .env file with REAL_MAC_ADDRESS, UNIFI_HOST, UNIFI_USER, and UNIFI_PASS.
 */
async function main() {
    const client = createUnifiClient();
    try {
        await client.connect();

        // Use the MAC from a real fixture or env
        const mac = process.env.TEST_MAC_ADDRESS || 'TEST_MAC_ADDRESS';
        const camera = client.findCameraByMac(mac);

        if (camera) {
            console.log('Found camera:', camera.name);
        } else {
            console.warn(`Camera with MAC ${mac} not found in bootstrap`);
        }
    } catch (error) {
        console.error('Smoke test failed:', error);
        process.exit(1);
    } finally {
        client.disconnect();
        process.exit(0);
    }
}

main();
