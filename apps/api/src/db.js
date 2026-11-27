import pg from 'pg';
import { config } from './config.js';

// bigint (count(*)) and numeric (coordinates, prices) as JS numbers.
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => Number.parseFloat(v));

// Remote databases are always encrypted. With DATABASE_CA_CERT (Supabase's
// certificate) the server's identity is verified as well.
const { hostname } = new URL(config.databaseUrl);
const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(hostname);
const ssl = isLocal ? false : config.databaseCaCert
  ? { ca: config.databaseCaCert.replace(/\\n/g, '\n') }
  : { rejectUnauthorized: false };

// Serverless instances each keep their own small pool.
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: process.env.VERCEL ? 3 : 10, ssl });
pool.on('error', (err) => console.error('idle database connection lost:', err.message));

export function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

/**
 * Run fn(client) in a transaction. The audit context (acting user, request id,
 * proposal being applied) is attached to the transaction so database triggers
 * record it in audit_logs.
 */
export async function withTransaction(ctx, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.user_id', $1, true),
              set_config('app.request_id', $2, true),
              set_config('app.proposal_id', $3, true)`,
      [ctx?.userId ?? '', ctx?.requestId ?? '', ctx?.proposalId ?? ''],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Shorthand: transaction with the context of the current request. */
export function tx(req, fn, extra = {}) {
  return withTransaction({ userId: req.viewer?.id, requestId: req.id, ...extra }, fn);
}
