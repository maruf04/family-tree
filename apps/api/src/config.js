// Environment configuration. Read once at startup.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const env = process.env;
const isProduction = env.NODE_ENV === 'production' || Boolean(env.VERCEL);
const hasLocalDatabase = /@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL ?? '');

export const config = {
  isProduction,
  port: Number(env.API_PORT ?? env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL,
  corsOrigins: (env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  supabase: {
    url: env.SUPABASE_URL || null,
    // Legacy HS256 projects use the JWT secret; newer projects publish a JWKS.
    jwtSecret: env.SUPABASE_JWT_SECRET || null,
    publishableKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || null,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || null,   // server only, never sent to clients
    storageBucket: env.SUPABASE_STORAGE_BUCKET || 'heritage-private',
  },
  // Self-registration is off: admins and moderators create accounts.
  allowRegistration: env.ALLOW_REGISTRATION === 'true',
  databaseCaCert: env.DATABASE_CA_CERT || null,
  // Development login ("Bearer dev:<user-uuid>") — only with a database on this
  // computer, so a hosting misconfiguration can never open it.
  devAuth: !isProduction && hasLocalDatabase && env.DEV_AUTH !== 'false',
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}
if (isProduction && env.DEV_AUTH === 'true') {
  throw new Error('DEV_AUTH cannot be enabled in production.');
}
