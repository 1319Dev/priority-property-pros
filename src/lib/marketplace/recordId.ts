const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Harness and unit-test ids such as book-1 or p1. Live rows are uuids. */
const FIXTURE_ID_RE = /^(?:(?:book|proj|pro|opp|est|user|thread|cat)-[a-z0-9]+|p\d+)$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * True for a uuid or a local fixture id. Anything else must not be sent to Postgres.
 */
export function isQueryableId(value: string | null | undefined): value is string {
  if (!value) return false;
  return isUuid(value) || FIXTURE_ID_RE.test(value);
}

export function friendlyNotFound(message: string | null | undefined, fallback = "We couldn't find that."): string {
  const text = (message ?? "").trim();
  if (!text) return fallback;
  if (/invalid input syntax for type uuid|22P02|syntax error|row-level security|permission denied/i.test(text)) {
    return fallback;
  }
  return text;
}
