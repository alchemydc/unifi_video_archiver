import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiProtectClient } from './unifi-protect-client.js';
import { Readable } from 'node:stream';
import type { ProtectCameraConfig } from 'unifi-protect';

// Mock the unifi-protect library
vi.mock('unifi-protect', () => {
    return {
        ProtectApi: vi.fn().mockImplementation(function () {
            return {
                login: vi.fn(),
                getBootstrap: vi.fn(),
                bootstrap: {
                    cameras: [
                        {
                            id: 'cam-uuid-1',
                            mac: 'A89C6C487E19',
                            name: 'Front Door',
                            host: '192.168.1.10',
                            connectionHost: 'front-door.local'
                        },
                        {
                            id: 'cam-uuid-2',
                            mac: 'B1:B2:B3:B4:B5:B6',
                            name: 'Back Yard',
                            host: 'back-yard.local',
                            connectionHost: null
                        }
                    ],
                },
                retrieve: vi.fn(),
                responseOk: vi.fn().mockReturnValue(true),
                reset: vi.fn(),
                name: 'Mock NVR [UDMP]',
            };
        })
    };
});

describe('UnifiProtectClient', () => {
    let client: UnifiProtectClient;
    let mockApi: Record<string, ReturnType<typeof vi.fn> | unknown>;

    beforeEach(() => {
        vi.clearAllMocks();
        client = new UnifiProtectClient('localhost', 'admin', 'password');
        // @ts-expect-error - accessing private field for testing
        mockApi = client['api'];
    });

    describe('connect', () => {
        it('should login and bootstrap successfully', async () => {
            (mockApi.login as ReturnType<typeof vi.fn>).mockResolvedValue(true);
            (mockApi.getBootstrap as ReturnType<typeof vi.fn>).mockResolvedValue(true);

            await expect(client.connect()).resolves.not.toThrow();
            expect(mockApi.login).toHaveBeenCalledWith('localhost', 'admin', 'password');
            expect(mockApi.getBootstrap).toHaveBeenCalled();
        });

        it('should throw if login fails', async () => {
            (mockApi.login as ReturnType<typeof vi.fn>).mockResolvedValue(false);

            await expect(client.connect()).rejects.toThrow('UniFi Protect login failed');
        });

        it('should throw if bootstrap fails', async () => {
            (mockApi.login as ReturnType<typeof vi.fn>).mockResolvedValue(true);
            (mockApi.getBootstrap as ReturnType<typeof vi.fn>).mockResolvedValue(false);

            await expect(client.connect()).rejects.toThrow('UniFi Protect bootstrap failed');
        });
    });

    describe('refreshBootstrap', () => {
        it('should refresh and return current bootstrap cameras', async () => {
            (mockApi.getBootstrap as ReturnType<typeof vi.fn>).mockResolvedValue(true);

            await expect(client.refreshBootstrap()).resolves.toEqual([
                {
                    id: 'cam-uuid-1',
                    mac: 'A89C6C487E19',
                    name: 'Front Door',
                    host: '192.168.1.10',
                    connectionHost: 'front-door.local',
                },
                {
                    id: 'cam-uuid-2',
                    mac: 'B1:B2:B3:B4:B5:B6',
                    name: 'Back Yard',
                    host: 'back-yard.local',
                    connectionHost: null,
                }
            ]);
            expect(mockApi.getBootstrap).toHaveBeenCalled();
        });
    });

    describe('findCameraByMac', () => {
        it('should find camera with various MAC formats', () => {
            // Test fixture MAC (no separators)
            const cam1 = client.findCameraByMac('A89C6C487E19');
            expect(cam1?.id).toBe('cam-uuid-1');

            // Lowercase and colons
            const cam2 = client.findCameraByMac('b1:b2:b3:b4:b5:b6');
            expect(cam2?.id).toBe('cam-uuid-2');

            // Mixed dash and upper
            const cam3 = client.findCameraByMac('A8-9C-6C-48-7E-19');
            expect(cam3?.id).toBe('cam-uuid-1');
        });

        it('should return null if camera not found', () => {
            const cam = client.findCameraByMac('NONEXISTENT');
            expect(cam).toBeNull();
        });
    });

    describe('exportVideoClip', () => {
        const mockCamera = { id: 'cam-id', name: 'Test Cam' } as unknown as ProtectCameraConfig;
        const mockTimeWindow = { start: 1000, end: 2000 };

        it('should return a readable stream on success', async () => {
            const mockStream = Readable.from(['data']);
            (mockApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
                statusCode: 200,
                body: mockStream
            });

            const stream = await client.exportVideoClip(mockCamera, mockTimeWindow);
            expect(stream).toBeDefined();
            expect(mockApi.retrieve).toHaveBeenCalledWith(
                expect.stringContaining('cam-id'),
                { method: 'GET' },
                expect.objectContaining({ timeout: 60000 })
            );
        });

        it('should throw if response is null', async () => {
            (mockApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue(null);

            await expect(client.exportVideoClip(mockCamera, mockTimeWindow))
                .rejects.toThrow('Video export failed: No response from NVR');
        });

        it('should throw if status code is not OK', async () => {
            (mockApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
                statusCode: 401,
                body: {}
            });
            (mockApi.responseOk as ReturnType<typeof vi.fn>).mockReturnValue(false);

            await expect(client.exportVideoClip(mockCamera, mockTimeWindow))
                .rejects.toThrow('Video export failed: HTTP 401');
        });
    });

    describe('disconnect', () => {
        it('should call api.reset', () => {
            client.disconnect();
            expect(mockApi.reset).toHaveBeenCalled();
        });
    });

    describe('getBootstrapCameras', () => {
        it('should return full camera metadata from bootstrap', () => {
            expect(client.getBootstrapCameras()).toEqual([
                {
                    id: 'cam-uuid-1',
                    name: 'Front Door',
                    mac: 'A89C6C487E19',
                    host: '192.168.1.10',
                    connectionHost: 'front-door.local',
                },
                {
                    id: 'cam-uuid-2',
                    name: 'Back Yard',
                    mac: 'B1:B2:B3:B4:B5:B6',
                    host: 'back-yard.local',
                    connectionHost: null,
                }
            ]);
        });
    });

    describe('createUnifiClient', () => {
        it('should create a new instance of UnifiProtectClient', async () => {
            const { createUnifiClient } = await import('./unifi-protect-client.js');
            const factoryClient = createUnifiClient();
            expect(factoryClient).toBeInstanceOf(UnifiProtectClient);
        });
    });
});
