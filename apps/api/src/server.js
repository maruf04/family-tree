import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const app = createApp({ serveWeb: config.isProduction });
const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}/api/v1`);
  if (config.devAuth) console.log('⚠ Development login is ENABLED (never in production)');
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
