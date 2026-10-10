type AdminErrorLike = { message?: string; code?: string } | null | undefined;

/** Maps a database or API failure to a sentence an admin can act on. The raw text stays in the console. */
export function friendlyAdminError(error: AdminErrorLike, fallback: string): string {
  const raw = error?.message?.trim() ?? "";
  const code = error?.code ?? "";
  if (raw || code) console.error("Admin request failed", { code, message: raw });

  if (code === "42501" || /not authorized|only an admin|permission denied/i.test(raw)) {
    return "You need an admin sign-in to do that.";
  }
  if (code === "PGRST301" || /jwt expired|invalid jwt|session expired/i.test(raw)) {
    return "Your session expired. Sign in again.";
  }
  if (/failed to fetch|networkerror|network request failed|timeout|load failed/i.test(raw)) {
    return "The server didn't respond. Check your connection and try again.";
  }
  if (code === "23505" || /duplicate key/i.test(raw)) {
    return "That record already exists.";
  }
  if (code === "23514" || /check constraint/i.test(raw)) {
    return "That value isn't allowed.";
  }
  if (/invalid cursor/i.test(raw)) {
    return "That page of activity couldn't be loaded. Refresh and try again.";
  }
  if (
    /^(You need an admin sign-in to do that\.|Your session expired\.|The server didn't respond|That record already exists\.|That value isn't allowed\.|That page of activity|Supabase is not configured yet\.)/.test(
      raw,
    )
  ) {
    return raw;
  }
  return fallback;
}
