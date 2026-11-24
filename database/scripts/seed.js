#!/usr/bin/env node
// Loads FICTIONAL development sample data. Refuses to run on anything but a local database.
// Each seed file is skipped if its data is already present.
// Usage: npm run db:seed
import { isLocalDatabase, loadEnv, loadSeeds, requireEnv, withClient } from './lib.js';

loadEnv();
if (process.env.NODE_ENV === 'production' || process.argv.includes('--production') || !isLocalDatabase(requireEnv('DATABASE_URL'))) {
  console.error('✗ Refusing to load fictional sample data into a production database.');
  process.exit(1);
}

try {
  await withClient(requireEnv('DATABASE_URL'), (client) => loadSeeds(client));
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}
