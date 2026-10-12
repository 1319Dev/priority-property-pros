/**
 * App-level bot friction for public auth forms. No third-party service.
 *
 * - Honeypot: a hidden field real people never see or fill. If it has a value, the form is
 *   treated as a bot: nothing is sent to Supabase and the page shows the normal "done" state.
 * - Minimum fill time: a submit faster than a person can fill the form is refused once with a
 *   friendly message. The second click passes because time has elapsed.
 *
 * This only slows simple bots that drive the page. Bots that call the Auth API directly are
 * handled server-side (Before User Created hook and Supabase Auth rate limits).
 */
export const HONEYPOT_FIELD_NAME = "company_website";

export const MIN_FILL_MS = {
  signUp: 2500,
  passwordReset: 1000,
  signIn: 0,
} as const;

export type BotGuardForm = keyof typeof MIN_FILL_MS;

export type BotGuardVerdict =
  | { ok: true }
  | { ok: false; reason: "honeypot"; silent: true }
  | { ok: false; reason: "too_fast"; silent: false; message: string };

export const TOO_FAST_MESSAGE = "Please take a moment to check the form, then press the button again.";

export function evaluateBotGuard(input: {
  form: BotGuardForm;
  honeypotValue: string | null | undefined;
  startedAtMs: number;
  nowMs: number;
}): BotGuardVerdict {
  if ((input.honeypotValue ?? "").trim() !== "") {
    return { ok: false, reason: "honeypot", silent: true };
  }
  const minimum = MIN_FILL_MS[input.form];
  if (minimum > 0 && input.nowMs - input.startedAtMs < minimum) {
    return { ok: false, reason: "too_fast", silent: false, message: TOO_FAST_MESSAGE };
  }
  return { ok: true };
}
