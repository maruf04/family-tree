// Environment configuration. Read once at startup.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: Number(env.API_PORT ?? env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL,
  corsOrigins: (env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  supabase: {
    url: env.SUPABASE_URL || null,
    // Legacy HS256 projects use the JWT secret; newer projects publish a JWKS.
    jwtSecret: env.SUPABASE_JWT_SECRET || null,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || null,   // server only, never sent to clients
    storageBucket: env.SUPABASE_STORAGE_BUCKET || 'heritage-private',
  },
  // Development login ("Bearer dev:<user-uuid>") — never available in production.
  devAuth: !isProduction && env.DEV_AUTH !== 'false',
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}
if (isProduction && env.DEV_AUTH === 'true') {
  throw new Error('DEV_AUTH cannot be enabled in production.');
}
