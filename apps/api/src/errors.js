// Errors carry a stable `code`; the web app translates codes into Bangla/English.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'unauthenticated', message);
export const forbidden = (code = 'forbidden', message = 'You do not have permission to do this') =>
  new AppError(403, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (code, message, details) => new AppError(409, code, message, details);

// PostgreSQL / application SQLSTATEs → HTTP errors.
const PG_ERRORS = {
  '23505': [409, 'duplicate'],
  '23503': [409, 'invalid_reference'],
  '23001': [409, 'in_use'],
  '23514': [422, 'constraint_violation'],
  '23502': [422, 'missing_field'],
  '22P02': [400, 'invalid_input'],
  '22007': [400, 'invalid_input'],
  '22008': [400, 'invalid_input'],
  VH001: [422, 'circular_ancestry'],
  VH002: [422, 'too_many_biological_parents'],
  VH003: [422, 'parent_spouse_conflict'],
  VH004: [422, 'merged_person'],
  VH005: [422, 'same_sex_biological_parents'],
  VH006: [422, 'root_membership'],
  VH101: [403, 'admin_only'],
  VH102: [409, 'last_admin'],
  VH900: [403, 'audit_immutable'],
};

export function toAppError(err) {
  if (err instanceof AppError) return err;
  const mapped = err?.code && PG_ERRORS[err.code];
  if (mapped) {
    // Domain check failures inside fuzzy dates are reported as such.
    // PostgreSQL 17 and older (Supabase) report ON DELETE RESTRICT as 23503, newer ones as 23001.
    const inUse = err.code === '23503' && /^update or delete on table/.test(err.message);
    const code = inUse ? 'in_use' : err.code === '23514' && /fuzzy_date/.test(err.message) ? 'invalid_date' : mapped[1];
    return new AppError(mapped[0], code, err.message, err.constraint ? { constraint: err.constraint } : undefined);
  }
  return null;
}

export function errorHandler(err, req, res, _next) {
  const appErr = toAppError(err);
  if (!appErr) {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON body' } });
    }
    console.error(`[${req.id}]`, err);
    return res.status(500).json({ error: { code: 'internal', message: 'Something went wrong', requestId: req.id } });
  }
  res.status(appErr.status).json({
    error: { code: appErr.code, message: appErr.message, details: appErr.details },
  });
}
