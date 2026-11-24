// Supabase Auth administration (server only; uses the secret key).
// Members sign in with a username. Supabase needs an email, so each username
// maps to an internal address that is never shown and never receives mail.
import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { AppError } from '../errors.js';

export const USERNAME_DOMAIN = 'members.bari.internal';   // must match apps/web/src/lib/username.js
export const usernameEmail = (username) => `${username.toLowerCase()}@${USERNAME_DOMAIN}`;

// No look-alike characters (0/o, 1/l/i): passwords are handed over on paper or by phone.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function temporaryPassword() {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

let client;
function admin() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new AppError(503, 'accounts_not_configured', 'Supabase is not configured');
  }
  client ??= createClient(config.supabase.url, config.supabase.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client.auth.admin;
}

function unwrap({ data, error }) {
  if (!error) return data;
  if (['email_exists', 'user_already_exists'].includes(error.code)) throw new AppError(409, 'username_taken', 'Username is already in use');
  if (['weak_password', 'same_password'].includes(error.code)) throw new AppError(422, error.code, error.message);
  throw new AppError(502, 'auth_service_error', error.message);
}

const supabaseProvider = {
  async create(email, password) {
    return unwrap(await admin().createUser({ email, password, email_confirm: true })).user.id;
  },
  async setPassword(id, password) {
    unwrap(await admin().updateUserById(id, { password }));
  },
  async remove(id) {
    unwrap(await admin().deleteUser(id));
  },
  /** True when this password currently belongs to the account. */
  async verifyPassword(id, password) {
    const { user } = unwrap(await admin().getUserById(id));
    const key = config.supabase.publishableKey ?? config.supabase.serviceRoleKey;
    const anon = createClient(config.supabase.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: user.email, password });
    if (data?.session) await anon.auth.signOut({ scope: 'local' });
    return !error;
  },
  async findByEmail(email) {
    for (let page = 1; page <= 20; page += 1) {
      const { users } = unwrap(await admin().listUsers({ page, perPage: 200 }));
      const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) return found.id;
      if (users.length < 200) return null;
    }
    return null;
  },
};

let provider = supabaseProvider;
export const authAdmin = () => provider;
/** Tests replace the provider so they never contact Supabase. */
export function setAuthAdmin(p) { provider = p ?? supabaseProvider; }
