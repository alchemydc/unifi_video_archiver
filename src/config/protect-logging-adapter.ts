import type { ProtectLogging } from 'unifi-protect';
import { logger } from './logger.js';

/**
 * Adapter that maps the project's Winston logger to the ProtectLogging interface 
 * expected by the unifi-protect library.
 */
export const protectLogger: ProtectLogging = {
    debug: (message: string, ...args: unknown[]) => logger.debug(message, ...args),
    info: (message: string, ...args: unknown[]) => logger.info(message, ...args),
    warn: (message: string, ...args: unknown[]) => logger.warn(message, ...args),
    error: (message: string, ...args: unknown[]) => logger.error(message, ...args),
};
