#!/usr/bin/env node
// Usage: npm run db:migrate            apply pending migrations
//        npm run db:status             show applied / pending migrations
import { databaseUrl, loadEnv, migrate, migrationStatus, withClient } from './lib.js';

loadEnv();

try {
  await withClient(databaseUrl(), async (client) => {
    if (process.argv.includes('--status')) {
      for (const m of await migrationStatus(client)) {
        const when = m.appliedAt ? m.appliedAt.toISOString() : '';
        console.log(`${m.state.padEnd(8)} ${m.name.padEnd(40)} ${when}`);
      }
      return;
    }
    await migrate(client);
  });
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}
