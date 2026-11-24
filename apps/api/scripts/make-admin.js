#!/usr/bin/env node
// Creates (or promotes) an admin. Needed once, for the first admin; later
// accounts are created on the website.
//   npm run make-admin -- username "আপনার নাম"          new login, temporary password
//   npm run make-admin -- you@example.com "আপনার নাম"   an existing Supabase login
//   npm run prod:make-admin -- ...                       the live site
import { databaseUrl, loadEnv, withClient } from '../../../database/scripts/lib.js';
import { authAdmin, temporaryPassword, usernameEmail } from '../src/lib/authAdmin.js';

loadEnv();
const [login, name] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const isEmail = login?.includes('@');
if (!login || (!isEmail && !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(login))) {
  console.error('Usage: npm run make-admin -- <username or email> "name"\n       username: small English letters and digits, at least 3');
  process.exit(1);
}

try {
  await withClient(databaseUrl(), async (db) => {
    const promote = await db.query(
      `UPDATE users SET role = 'admin', membership_status = 'verified', verified_at = coalesce(verified_at, now())
       WHERE ${isEmail ? 'email' : 'username'} = $1 RETURNING id`, [login]);
    if (promote.rowCount) return console.log(`✓ ${login} is an admin`);
    if (!name) throw new Error('Add a name in quotes, e.g. npm run make-admin -- karim "আব্দুল করিম"');

    let password = null;
    let id = await authAdmin().findByEmail(isEmail ? login : usernameEmail(login));
    if (!id && isEmail) throw new Error(`Supabase has no login with the email ${login}. Use a username instead.`);
    if (!id) {
      password = temporaryPassword();
      id = await authAdmin().create(usernameEmail(login), password);
    }
    await db.query(
      `INSERT INTO users (id, ${isEmail ? 'email' : 'username'}, display_name_bn, role, membership_status, verified_at, must_change_password)
       VALUES ($1, $2, $3, 'admin', 'verified', now(), $4)`, [id, login, name, Boolean(password)]);
    console.log(`✓ ${login} is an admin`);
    console.log(password ? `  Temporary password (shown once): ${password}` : '  Sign in with the password this login already has.');
  });
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}
process.exit();
