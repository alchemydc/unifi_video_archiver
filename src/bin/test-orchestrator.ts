import { createUnifiClient } from '../clients/unifi-protect-client.js';
import { createStorageProvider } from '../storage/index.js';
import { createOrchestrator } from '../orchestrator/index.js';
import type { WebhookPayload } from '../schemas/webhook.schema.js';

/**
 * Manual smoke test for CaptureOrchestrator.
 * Requires a live NVR and a .env configured with real credentials plus TEST_MAC_ADDRESS.
 */
async function main() {
    const client = createUnifiClient();
    try {
        console.log('Connecting to UniFi Protect NVR...');
        await client.connect();

        const storage = createStorageProvider();
        const orchestrator = createOrchestrator(client, storage);

        const mac = process.env.TEST_MAC_ADDRESS;
        if (!mac) {
            throw new Error('TEST_MAC_ADDRESS environment variable is not set');
        }

        console.log(`Starting orchestrator smoke test for MAC: ${mac}`);

        // Synthetic payload mimicking a real webhook arriving now
        const payload: WebhookPayload = {
            alarm: {
                name: 'Orchestrator Smoke Test',
                triggers: [{ key: 'motion', device: mac }],
            },
            timestamp: Date.now() - 30000, // Look back 30 seconds
        };

        const result = await orchestrator.handleWebhook(payload);
        console.log('Success! Clip archived to:', result.location);
    } catch (error) {
        console.error('Orchestrator smoke test failed:', error);
        process.exit(1);
    } finally {
        client.disconnect();
        process.exit(0);
    }
}

main();
