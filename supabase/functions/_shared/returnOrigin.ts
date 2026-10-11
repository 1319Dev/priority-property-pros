/** Checkout return origins. No secrets and no Deno globals in this module. */

export const BUILTIN_RETURN_ORIGINS = [
  "https://prioritypropertypros.com",
  "https://www.prioritypropertypros.com",
] as const;

export function canonicalReturnOrigin(value: string): string | null {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.origin !== trimmed) return null;
  return url.origin;
}

export function originIsAllowed(
  origin: string,
  configured: { siteUrl?: string | null; extraOrigins?: string | null } = {},
): boolean {
  const canonical = canonicalReturnOrigin(origin);
  if (!canonical) return false;
  const url = new URL(canonical);
  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
  if (url.protocol !== "https:") return false;
  const allowed = new Set<string>(BUILTIN_RETURN_ORIGINS);
  const extras = [configured.siteUrl ?? "", ...(configured.extraOrigins ?? "").split(",")];
  for (const item of extras) {
    const parsed = canonicalReturnOrigin(item);
    if (parsed && new URL(parsed).protocol === "https:") allowed.add(parsed);
  }
  return allowed.has(canonical);
}
