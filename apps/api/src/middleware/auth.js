// Authentication: Supabase JWT (production) or "dev:<uuid>" tokens (development only).
// Authorization helpers: requireAuth, requireVerified, requireRole.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { query } from '../db.js';
import { AppError, forbidden, unauthorized } from '../errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_RANK = { member: 1, moderator: 2, admin: 3 };

let jwks;
async function verifySupabaseToken(token) {
  const { url, jwtSecret } = config.supabase;
  if (!url) throw unauthorized('Authentication is not configured');
  const options = { issuer: `${url}/auth/v1`, audience: 'authenticated' };
  if (jwtSecret) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), options);
    return payload;
  }
  jwks ??= createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, options);
  return payload;
}

async function loadViewer(userId) {
  const { rows } = await query(
    `SELECT u.id, u.role, u.membership_status, u.person_id, u.display_name_bn, u.display_name_en,
            u.preferred_language, u.must_change_password,
            coalesce(array_agg(fm.family_id) FILTER (WHERE fm.family_id IS NOT NULL), '{}') AS family_ids
     FROM users u
     LEFT JOIN family_members fm ON fm.person_id = u.person_id
     WHERE u.id = $1
     GROUP BY u.id`, [userId]);
  const u = rows[0];
  if (!u) return null;
  // A temporary password grants nothing until it has been changed.
  const verified = u.membership_status === 'verified' && !u.must_change_password;
  return {
    id: u.id,
    role: u.role,
    membershipStatus: u.membership_status,
    mustChangePassword: u.must_change_password,
    verified,
    personId: u.person_id,
    familyIds: u.family_ids,
    // Role powers apply only to verified accounts.
    isModerator: verified && ROLE_RANK[u.role] >= ROLE_RANK.moderator,
    isAdmin: verified && u.role === 'admin',
  };
}

/** Populates req.auth (identity) and req.viewer (application user) when a token is sent. */
export async function authenticate(req, _res, next) {
  req.auth = null;
  req.viewer = null;
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return next();
  const token = header.slice(7).trim();

  try {
    if (token.startsWith('dev:')) {
      if (!config.devAuth) throw unauthorized('Development login is disabled');
      req.auth = { id: token.slice(4), email: null, phone: null };
    } else {
      const payload = await verifySupabaseToken(token);
      req.auth = { id: payload.sub, email: payload.email ?? null, phone: payload.phone ?? null };
    }
  } catch (err) {
    return next(err instanceof AppError ? err : unauthorized('Invalid or expired session'));
  }
  if (!UUID.test(req.auth.id ?? '')) return next(unauthorized('Invalid session'));

  req.viewer = await loadViewer(req.auth.id);
  next();
}

/** Signed in AND has an application profile. */
export function requireAuth(req, _res, next) {
  if (!req.auth) return next(unauthorized());
  if (!req.viewer) return next(forbidden('profile_required', 'Complete your profile first'));
  next();
}

/** Verified village member (the platform is private). */
export function requireVerified(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.viewer.mustChangePassword) return next(forbidden('password_change_required', 'Change your temporary password first'));
    if (!req.viewer.verified) return next(forbidden('verification_required', 'Village membership verification required'));
    next();
  });
}

/** Verified user with at least the given role: 'moderator' or 'admin'. */
export function requireRole(minRole) {
  return (req, res, next) => {
    requireVerified(req, res, (err) => {
      if (err) return next(err);
      if (ROLE_RANK[req.viewer.role] < ROLE_RANK[minRole]) {
        return next(forbidden(minRole === 'admin' ? 'admin_only' : 'moderator_only'));
      }
      next();
    });
  };
}
