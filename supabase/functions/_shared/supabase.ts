import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function userFromRequest(req: Request): Promise<{ id: string; email?: string }> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!url || !anon || !auth) throw new Error("sign in required");
  const client = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("sign in required");
  return { id: data.user.id, email: data.user.email };
}

export async function isAdmin(svc: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await svc.from("profiles").select("account_type, account_status").eq("id", userId).maybeSingle();
  return data?.account_type === "ADMIN" && data?.account_status === "ACTIVE";
}
