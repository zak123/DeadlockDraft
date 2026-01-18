import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  APP_URL: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('./data/deadlock-draft.db'),
  STEAM_API_KEY: z.string().min(1, 'STEAM_API_KEY is required'),
  DEADLOCK_API_KEY: z.string().optional().default(''),
  DEADLOCK_API_URL: z.string().optional().default(''),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  LOBBY_EXPIRY_HOURS: z.string().default('2').transform(Number),
  // Twitch OAuth
  TWITCH_CLIENT_ID: z.string().optional().default(''),
  TWITCH_CLIENT_SECRET: z.string().optional().default(''),
  TWITCH_REDIRECT_URI: z.string().optional().default(''),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedConfig: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (cachedConfig) return cachedConfig;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration');
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function isDev(): boolean {
  return getConfig().NODE_ENV === 'development';
}

export function isProd(): boolean {
  return getConfig().NODE_ENV === 'production';
}
