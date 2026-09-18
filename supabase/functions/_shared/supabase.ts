export async function restRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: string | null }> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) return { data: null, error: text || res.statusText };
  return { data: text ? JSON.parse(text) : null, error: null };
}

export async function userIdFromRequest(req: Request): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: auth },
  });
  if (!res.ok) throw new Error("not signed in");
  const user = (await res.json()) as { id?: string };
  if (!user.id) throw new Error("not signed in");
  return user.id;
}

export function allowedOrigin(origin: string): boolean {
  const value = origin.trim().replace(/\/$/, "");
  if (!value) return false;
  const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  if (site && value === site) return true;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
    if (url.protocol !== "https:") return false;
    if (url.username || url.password || url.search || url.hash) return false;
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}
