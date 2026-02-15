import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    // Logging
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // UniFi NVR
    UNIFI_HOST: z.string().min(1),
    UNIFI_USER: z.string().min(1),
    UNIFI_PASS: z.string().min(1),

    // Storage
    STORAGE_TYPE: z.enum(['fs', 'r2', 's3']).default('fs'),
    OUTPUT_DIR: z.string().default('./clips'),

    // Capture timing
    CAPTURE_PRE_BUFFER_SECONDS: z.coerce.number().default(10),
    CAPTURE_POST_BUFFER_SECONDS: z.coerce.number().default(20),
    SETTLING_DELAY_SECONDS: z.coerce.number().default(5),

    // Retry configuration
    RETRY_MAX_ATTEMPTS: z.coerce.number().default(3),
    RETRY_INITIAL_DELAY_MS: z.coerce.number().default(1000),
    RETRY_BACKOFF_MULTIPLIER: z.coerce.number().default(2),
    RETRY_MAX_DELAY_MS: z.coerce.number().default(15000),

    // Server
    WEBHOOK_PORT: z.coerce.number().default(3000),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
