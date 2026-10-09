export const PROJECT_REFERENCE_PREFIX = "PPP-";

const REFERENCE_INPUT = /^(?:ppp[-\s]?)?(\d+)$/i;

function positiveInteger(value: number): number | null {
  if (!Number.isSafeInteger(value) || value < 1) return null;
  return value;
}

/** Display form for a stored project reference. Missing values stay hidden. */
export function formatProjectReference(value: number | string | null | undefined): string | null {
  const number = coerceProjectReference(value);
  if (number == null) return null;
  return `${PROJECT_REFERENCE_PREFIX}${number}`;
}

export function coerceProjectReference(value: unknown): number | null {
  if (typeof value === "number") return positiveInteger(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return positiveInteger(Number(value.trim()));
  return null;
}

/**
 * Admin search accepts the display form or the bare number.
 * "PPP-1042", "ppp-1042", and "1042" all resolve to 1042.
 */
export function parseProjectReference(input: string | null | undefined): number | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const match = REFERENCE_INPUT.exec(raw);
  if (!match?.[1]) return null;
  return positiveInteger(Number(match[1]));
}

export function isMissingReferenceColumn(message: string | null | undefined): boolean {
  return /reference_number/i.test(message ?? "");
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the selection fallback.
  }
  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
