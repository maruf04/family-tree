import pg from 'pg';
import { config } from './config.js';

// bigint (count(*)) and numeric (coordinates, prices) as JS numbers.
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => Number.parseFloat(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

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
