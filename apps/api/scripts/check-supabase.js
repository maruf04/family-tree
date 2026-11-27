#!/usr/bin/env node
// Checks the Supabase values in .env and creates the private storage bucket if
// it is missing. Never prints a key. Usage: npm run check:supabase
import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config.js';

const env = process.env;
let failed = 0;
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m, hint) => { failed += 1; console.log(`✗ ${m}\n    → ${hint}`); };

/** 'secret' | 'public' | null, for both the new and the legacy key formats. */
function keyKind(key) {
  if (key?.startsWith('sb_secret_')) return 'secret';
  if (key?.startsWith('sb_publishable_')) return 'public';
  try {
    const { role } = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    return role === 'service_role' ? 'secret' : role === 'anon' ? 'public' : null;
  } catch { return null; }
}

async function main() {
  const url = env.SUPABASE_URL;
  if (!url) return bad('SUPABASE_URL is empty', 'Paste the Project URL, e.g. https://abcd1234.supabase.co');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return bad('SUPABASE_URL does not look right', 'It should be exactly https://<project>.supabase.co, with nothing after .co');
  if (env.VITE_SUPABASE_URL === url) ok('Project URL set for server and browser');
  else bad('VITE_SUPABASE_URL is different from SUPABASE_URL', 'Put the same Project URL in both');

  const pub = env.VITE_SUPABASE_ANON_KEY;
  // Most important check: this value is sent to every visitor's browser.
  if (keyKind(pub) === 'secret') return bad('DANGER: VITE_SUPABASE_ANON_KEY contains the SECRET key', 'Replace it with the publishable key (sb_publishable_...) now');
  if (keyKind(pub) !== 'public') bad('VITE_SUPABASE_ANON_KEY is missing or wrong', 'Paste the Publishable key (sb_publishable_...)');
  else {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: pub } });
    if (res.ok) ok('Publishable key works');
    else bad(`Publishable key was refused (${res.status})`, 'Copy it again from Settings > API Keys of this same project');
  }

  const jwks = await fetch(`${url}/auth/v1/.well-known/jwks.json`).then((r) => r.json()).catch(() => null);
  if (jwks?.keys?.length) {
    ok('Sign-in tokens can be verified');
    if (env.SUPABASE_JWT_SECRET) bad('SUPABASE_JWT_SECRET is set but this project does not need it', 'Leave SUPABASE_JWT_SECRET empty');
  } else if (env.SUPABASE_JWT_SECRET) ok('Legacy JWT secret is set');
  else bad('This project uses the legacy JWT secret', 'Settings > JWT Keys: use "Migrate JWT secret" and rotate, or paste the legacy secret into SUPABASE_JWT_SECRET');

  if (keyKind(env.SUPABASE_SERVICE_ROLE_KEY) !== 'secret') return bad('SUPABASE_SERVICE_ROLE_KEY is missing or wrong', 'Paste the Secret key (sb_secret_...)');
  const storage = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage;
  const { data: buckets, error } = await storage.listBuckets();
  if (error) return bad(`Secret key was refused: ${error.message}`, 'Copy it again from Settings > API Keys of this same project');
  ok('Secret key works');
  const name = config.supabase.storageBucket;
  const bucket = buckets.find((b) => b.name === name);
  if (bucket?.public) bad(`Storage bucket "${name}" is PUBLIC`, 'Make it private in Supabase > Storage');
  else if (bucket) ok(`Private storage bucket "${name}" exists`);
  else {
    const created = await storage.createBucket(name, { public: false, fileSizeLimit: 50 * 1024 * 1024 });
    if (created.error) bad(`Could not create the storage bucket: ${created.error.message}`, `Create a private bucket named ${name} in Supabase > Storage`);
    else ok(`Created private storage bucket "${name}"`);
  }
}

try {
  await main();
} catch (err) {
  bad(`Cannot reach Supabase: ${err.message}`, 'Check SUPABASE_URL and your internet connection');
}
console.log(failed ? `\n${failed} problem(s) to fix in .env` : '\nAll good. Restart with: npm run dev');
process.exitCode = failed ? 1 : 0;
