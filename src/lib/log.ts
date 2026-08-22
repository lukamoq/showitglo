/**
 * Structured, single-line JSON logging.
 *
 * One line per event so log drains (Vercel, Datadog, CloudWatch) can index
 * fields without a parser. Never pass tokens, secrets, card data or PII —
 * ids and amounts only.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (configured in LEVEL_ORDER) return LEVEL_ORDER[configured];
  return process.env.NODE_ENV === 'production' ? LEVEL_ORDER.info : LEVEL_ORDER.debug;
}

/** Keys that must never be serialized, whatever the caller passes. */
const REDACTED_KEYS = new Set([
  'client_secret',
  'clientsecret',
  'secret',
  'token',
  'api_key',
  'apikey',
  'key_token',
  'password',
  'authorization',
  'cookie',
  'card',
  'card_number',
  'email',
]);

function scrub(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
      continue;
    }
    if (value instanceof Error) {
      out[key] = value.message;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < minLevel()) return;

  let line: string;
  try {
    line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...scrub(fields) });
  } catch {
    line = JSON.stringify({ ts: new Date().toISOString(), level, event, note: 'fields_unserializable' });
  }

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logDebug = (event: string, fields?: LogFields) => log('debug', event, fields);
export const logInfo = (event: string, fields?: LogFields) => log('info', event, fields);
export const logWarn = (event: string, fields?: LogFields) => log('warn', event, fields);
export const logError = (event: string, fields?: LogFields) => log('error', event, fields);
