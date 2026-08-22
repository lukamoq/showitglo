/**
 * Route plumbing shared by every `/api/v1` handler.
 *
 * Three jobs, all of them things that must be identical across routes or the
 * API stops being predictable:
 *
 *   * one error envelope — `{ error, code }` plus the right status;
 *   * input validation that rejects rather than coerces, so a bad request can
 *     never become a differently-shaped good one;
 *   * a single failure funnel that turns domain errors into 4xx and anything
 *     unexpected into a 500 whose body says nothing about our internals.
 */

import { NextResponse } from 'next/server';

import { isStoreError } from './db/store';
import { MAX_EMAIL_LENGTH, isValidEmail, normalizeEmail } from './email';
import { log } from './log';

// ==========================================================================
// Error envelope
// ==========================================================================

export function jsonError(
  message: string,
  code: string,
  status: number,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

export function badRequest(message: string, code = 'BAD_REQUEST', extra: Record<string, unknown> = {}) {
  return jsonError(message, code, 400, extra);
}

export function badOrigin() {
  return jsonError('Cross-origin request rejected.', 'BAD_ORIGIN', 403);
}

export function authRequired() {
  return jsonError('A session is required for this action.', 'AUTH_REQUIRED', 401);
}

export function notFound(message: string, code = 'NOT_FOUND') {
  return jsonError(message, code, 404);
}

export function rateLimited(message: string, resetInMs: number) {
  const seconds = Math.max(1, Math.ceil(resetInMs / 1000));
  return NextResponse.json(
    { error: message, code: 'RATE_LIMITED', retry_after_ms: resetInMs },
    { status: 429, headers: { 'Retry-After': String(seconds) } }
  );
}

/**
 * The only place a 500 is produced.
 *
 * A `StoreError` is a domain outcome the caller is entitled to see, so it maps
 * to its own status and code. Everything else is our bug or our outage: it is
 * logged with the event name for correlation, and the client is told nothing
 * beyond "internal server error" — no `err.message`, which is how stack
 * details, SQL text and connection strings leak out of APIs.
 */
export function failure(event: string, err: unknown, fields: Record<string, unknown> = {}): NextResponse {
  if (isStoreError(err)) {
    return NextResponse.json({ error: err.message, code: err.code, ...err.details }, { status: err.status });
  }

  log('error', event, { ...fields, error: err instanceof Error ? err.message : 'unknown' });
  return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
}

// ==========================================================================
// Character hygiene
// ==========================================================================

/**
 * True when the string carries C0/C1 control characters.
 *
 * Written as a scan rather than a regex so the source file itself contains no
 * literal control bytes. Tab (9), LF (10) and CR (13) are allowed through for
 * multi-line fields; everything else below 32, DEL (127) and the C1 block
 * (128-159) is rejected — those only ever arrive by accident or by attempt,
 * and they break every downstream renderer that displays the value.
 */
export function hasControlChars(value: string, allowLineBreaks = false): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (allowLineBreaks && (code === 9 || code === 10 || code === 13)) continue;
    if (code < 32 || code === 127 || (code >= 128 && code <= 159)) return true;
  }
  return false;
}

// ==========================================================================
// Request parsing
// ==========================================================================

export type BodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/** Parses a JSON body, treating an empty body as `{}` and malformed as 400. */
export async function readJsonBody(request: Request, { allowEmpty = true } = {}): Promise<BodyResult> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: badRequest('Could not read the request body.') };
  }

  if (raw.trim().length === 0) {
    if (allowEmpty) return { ok: true, body: {} };
    return { ok: false, response: badRequest('A JSON body is required.') };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, response: badRequest('Request body must be a JSON object.') };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: badRequest('Invalid JSON body.') };
  }
}

export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export type IdempotencyResult = { ok: true; key: string | null } | { ok: false; response: NextResponse };

/** Reads and bounds the optional `Idempotency-Key` header. */
export function readIdempotencyKey(request: Request): IdempotencyResult {
  const raw = request.headers.get('idempotency-key');
  if (raw === null) return { ok: true, key: null };

  const key = raw.trim();
  if (key.length === 0) return { ok: true, key: null };

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      ok: false,
      response: badRequest(
        `Idempotency-Key must be ${MAX_IDEMPOTENCY_KEY_LENGTH} characters or fewer.`,
        'INVALID_IDEMPOTENCY_KEY'
      ),
    };
  }

  if (hasControlChars(key)) {
    return {
      ok: false,
      response: badRequest('Idempotency-Key contains unsupported characters.', 'INVALID_IDEMPOTENCY_KEY'),
    };
  }

  return { ok: true, key };
}

// ==========================================================================
// Pagination
// ==========================================================================

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export const MAX_PAGE_OFFSET = 10000;

export type PaginationResult =
  | { ok: true; limit: number; offset: number }
  | { ok: false; response: NextResponse };

/**
 * `?limit` / `?offset`, rejected rather than clamped when out of range: a
 * client asking for 100000 rows has a bug, and silently serving 100 hides it.
 */
export function readPagination(
  url: URL,
  { defaultLimit = DEFAULT_PAGE_LIMIT, maxLimit = MAX_PAGE_LIMIT } = {}
): PaginationResult {
  const limitRaw = url.searchParams.get('limit');
  const offsetRaw = url.searchParams.get('offset');

  let limit = defaultLimit;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maxLimit) {
      return {
        ok: false,
        response: badRequest(`limit must be an integer between 1 and ${maxLimit}.`, 'INVALID_PAGINATION'),
      };
    }
    limit = parsed;
  }

  let offset = 0;
  if (offsetRaw !== null) {
    const parsed = Number(offsetRaw);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_PAGE_OFFSET) {
      return {
        ok: false,
        response: badRequest(`offset must be an integer between 0 and ${MAX_PAGE_OFFSET}.`, 'INVALID_PAGINATION'),
      };
    }
    offset = parsed;
  }

  return { ok: true, limit, offset };
}

// ==========================================================================
// Field validation
// ==========================================================================

export type FieldResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export interface TextOptions {
  field: string;
  max: number;
  min?: number;
  /** Multi-line fields (post bodies, opinions) tolerate tab, LF and CR. */
  multiline?: boolean;
}

/**
 * Validates a required text field: must be a string, trims to non-empty, fits
 * the length budget, and carries no control characters.
 */
export function requiredText(value: unknown, opts: TextOptions): FieldResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, response: badRequest(`${opts.field} is required.`, 'INVALID_FIELD', { field: opts.field }) };
  }

  const trimmed = value.trim();
  const min = opts.min ?? 1;

  if (trimmed.length < min) {
    return {
      ok: false,
      response: badRequest(
        min === 1 ? `${opts.field} is required.` : `${opts.field} must be at least ${min} characters.`,
        'INVALID_FIELD',
        { field: opts.field }
      ),
    };
  }

  if (trimmed.length > opts.max) {
    return {
      ok: false,
      response: badRequest(`${opts.field} must be ${opts.max} characters or fewer.`, 'INVALID_FIELD', {
        field: opts.field,
        max_length: opts.max,
      }),
    };
  }

  if (hasControlChars(trimmed, opts.multiline === true)) {
    return {
      ok: false,
      response: badRequest(`${opts.field} contains unsupported control characters.`, 'INVALID_FIELD', {
        field: opts.field,
      }),
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * Same rules, but absent or blank is a legitimate answer. Anything else
 * present must still be a valid string.
 */
export function optionalText(value: unknown, opts: TextOptions): FieldResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === 'string' && value.trim().length === 0) return { ok: true, value: null };

  const result = requiredText(value, opts);
  return result.ok ? { ok: true, value: result.value } : result;
}

/** An integer inside [min, max]. Floats, NaN, Infinity and strings are rejected. */
export function integerField(
  value: unknown,
  opts: { field: string; min: number; max: number; fallback?: number }
): FieldResult<number> {
  const raw = value === undefined || value === null ? opts.fallback : value;

  if (raw === undefined) {
    return { ok: false, response: badRequest(`${opts.field} is required.`, 'INVALID_FIELD', { field: opts.field }) };
  }

  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < opts.min || raw > opts.max) {
    return {
      ok: false,
      response: badRequest(
        `${opts.field} must be a whole number between ${opts.min} and ${opts.max}.`,
        'INVALID_FIELD',
        { field: opts.field, min: opts.min, max: opts.max }
      ),
    };
  }

  return { ok: true, value: raw };
}

/** A member of a fixed set. Anything else is a 400 that names the options. */
export function enumField<T extends string>(
  value: unknown,
  opts: { field: string; allowed: readonly T[]; fallback?: T }
): FieldResult<T> {
  const raw = value === undefined || value === null ? opts.fallback : value;

  if (typeof raw === 'string' && (opts.allowed as readonly string[]).includes(raw)) {
    return { ok: true, value: raw as T };
  }

  return {
    ok: false,
    response: badRequest(`${opts.field} must be one of: ${opts.allowed.join(', ')}.`, 'INVALID_FIELD', {
      field: opts.field,
      allowed: opts.allowed,
    }),
  };
}

/**
 * A required email address, normalised to lower case.
 *
 * The bound is RFC 5321's 254 characters, not a guess — anything longer is
 * undeliverable, and accepting it would let a caller push arbitrary-length
 * strings into a UNIQUE column and into an outgoing HTTP request.
 */
export function emailField(value: unknown, field = 'email'): FieldResult<string> {
  const invalid = badRequest('Enter a valid email address.', 'INVALID_EMAIL', { field });

  if (typeof value !== 'string') return { ok: false, response: invalid };

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return { ok: false, response: invalid };
  if (hasControlChars(trimmed)) return { ok: false, response: invalid };
  if (!isValidEmail(trimmed)) return { ok: false, response: invalid };

  return { ok: true, value: normalizeEmail(trimmed) };
}

/** Same rules, but an absent or blank value is a legitimate "no address". */
export function optionalEmailField(value: unknown, field = 'email'): FieldResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === 'string' && value.trim().length === 0) return { ok: true, value: null };
  return emailField(value, field);
}

export const MAX_URL_LENGTH = 500;

/** An absolute http(s) URL, length-bounded. Other schemes are rejected. */
export function optionalHttpUrl(value: unknown, field: string): FieldResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };

  if (typeof value !== 'string') {
    return { ok: false, response: badRequest(`${field} must be a URL string.`, 'INVALID_FIELD', { field }) };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      response: badRequest(`${field} must be ${MAX_URL_LENGTH} characters or fewer.`, 'INVALID_FIELD', { field }),
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, response: badRequest(`${field} must be a valid absolute URL.`, 'INVALID_FIELD', { field }) };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, response: badRequest(`${field} must be an http or https URL.`, 'INVALID_FIELD', { field }) };
  }

  return { ok: true, value: trimmed };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD`, and a date that actually exists (rejects 2026-02-31). */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
