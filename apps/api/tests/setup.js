// Shared API test setup: rebuild the *_test database, then load the app
// pointed at it. The app module reads DATABASE_URL at import time.
import { F, P, U, createTestDb } from '../../../database/tests/helpers.js';

export { F, P, U };

export async function setupApp() {
  const db = await createTestDb();
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DEV_AUTH = 'true';
  process.env.ALLOW_REGISTRATION = 'true';   // the self-registration path is still tested
  const { createApp } = await import('../src/app.js');
  const { pool } = await import('../src/db.js');
  const app = createApp({ rateLimits: false });
  return {
    app,
    db,
    async close() {
      await pool.end();
      await db.end();
    },
  };
}

export const as = (userId) => ({ Authorization: `Bearer dev:${userId}` });
