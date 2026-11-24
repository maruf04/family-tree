#!/usr/bin/env node
// Loads FICTIONAL development sample data. Refuses to run when NODE_ENV=production.
// Each seed file is skipped if its data is already present.
// Usage: npm run db:seed
import { loadEnv, loadSeeds, requireEnv, withClient } from './lib.js';

loadEnv();
if (process.env.NODE_ENV === 'production') {
  console.error('✗ Refusing to load fictional sample data into a production database.');
  process.exit(1);
}

try {
  await withClient(requireEnv('DATABASE_URL'), (client) => loadSeeds(client));
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}
