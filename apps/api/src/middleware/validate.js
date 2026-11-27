// Request validation with zod. Parsed values are placed on req.valid.
import { z } from 'zod';
import { badRequest } from '../errors.js';

export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    req.valid ??= {};
    for (const [key, schema] of Object.entries({ body, query, params })) {
      if (!schema) continue;
      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        return next(badRequest('validation_failed', 'Invalid request', result.error.issues.map((i) => ({
          path: [key, ...i.path].join('.'),
          message: i.message,
        }))));
      }
      req.valid[key] = result.data;
    }
    next();
  };
}

// ---------------------------------------------------------------- shared schemas

export const uuid = z.string().uuid();
export const idParams = z.object({ id: uuid });

const optText = (max) => z.string().trim().max(max).nullable().optional()
  .transform((v) => (v === '' ? null : v));
export const text = (max = 500) => optText(max);
export const longText = (max = 50000) => optText(max);

const smallint = z.number().int();
export const fuzzyDate = z.object({
  qualifier: z.enum(['exact', 'about', 'before', 'after', 'between']),
  year: smallint.min(1000).max(2200),
  month: smallint.min(1).max(12).nullable().optional(),
  day: smallint.min(1).max(31).nullable().optional(),
  year_to: smallint.min(1000).max(2200).nullable().optional(),
  month_to: smallint.min(1).max(12).nullable().optional(),
  day_to: smallint.min(1).max(31).nullable().optional(),
}).strict().nullable().optional();

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export const privacyLevel = z.enum(['public', 'members', 'family', 'restricted']);

/** At least one of name_bn / name_en style pairs must be present. */
export function requireOneOf(schema, a, b, message = 'Provide a Bangla or English value') {
  return schema.refine((v) => (v[a] ?? '').trim() !== '' || (v[b] ?? '').trim() !== '', {
    message, path: [a],
  });
}
