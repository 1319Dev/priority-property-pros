import { json, optionsResponse } from "../_shared/cors.ts";
import { restRpc } from "../_shared/supabase.ts";

const RECENT_SIGN_IN_MS = 10 * 60 * 1000;

type AuthUser = { id: string; email: string; lastSignInAt: string | null };

function friendlyDeleteError(raw: string): string {
  let text = raw.trim();
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown; msg?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) text = parsed.message;
    else if (typeof parsed.error === "string" && parsed.error.trim()) text = parsed.error;
    else if (typeof parsed.msg === "string" && parsed.msg.trim()) text = parsed.msg;
  } catch {
    const match = text.match(/"message"\s*:\s*"([^"]+)"/);
    if (match?.[1]) text = match[1];
  }
  if (/last active admin/i.test(text)) {
    return "This is the last admin account, so it cannot be deleted.";
  }
  if (/open dispute before deleting/i.test(text)) {
    return "Resolve the open dispute before deleting this account.";
  }
  if (/outstanding refund/i.test(text)) {
    return "Wait until the outstanding refund is finished before deleting this account.";
  }
  if (/active jobs before deleting/i.test(text)) {
    return "Finish or cancel your active jobs before deleting this account.";
  }
  if (/current password/i.test(text)) {
    return "Enter your current password to delete this account.";
  }
  if (/you can only delete your own account/i.test(text)) {
    return "You can only delete your own account.";
  }
  if (/could not close the auth user/i.test(text)) {
    return "We couldn't delete this account. Nothing was changed and nothing was charged. Contact support.";
  }
  return "We couldn't delete this account. Nothing was changed and nothing was charged. If this keeps happening, contact support.";
}

async function authUserFromRequest(req: Request): Promise<AuthUser> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: auth },
  });
  if (!res.ok) throw new Error("not signed in");
  const user = (await res.json()) as { id?: string; email?: string; last_sign_in_at?: string | null };
  if (!user.id) throw new Error("not signed in");
  return { id: user.id, email: user.email ?? "", lastSignInAt: user.last_sign_in_at ?? null };
}

function recentSignIn(lastSignInAt: string | null): boolean {
  if (!lastSignInAt) return false;
  const at = Date.parse(lastSignInAt);
  if (Number.isNaN(at)) return false;
  return Date.now() - at <= RECENT_SIGN_IN_MS;
}

async function passwordMatches(email: string, password: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}

type StorageListItem = { name?: string; id?: string | null };

async function listStoragePage(bucket: string, prefix: string, offset: number): Promise<StorageListItem[]> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const list = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
  });
  if (!list.ok) return [];
  const items = (await list.json()) as StorageListItem[];
  return Array.isArray(items) ? items : [];
}

async function deleteStoragePaths(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  await fetch(`${url}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: paths }),
  });
}

async function removeStoragePrefix(bucket: string, prefix: string): Promise<void> {
  const clean = prefix.replace(/\/$/, "");
  let offset = 0;
  const files: string[] = [];
  const folders: string[] = [];
  for (;;) {
    const items = await listStoragePage(bucket, clean, offset);
    if (!items.length) break;
    for (const item of items) {
      if (!item.name) continue;
      const path = `${clean}/${item.name}`;
      if (item.id == null) folders.push(path);
      else files.push(path);
    }
    if (items.length < 100) break;
    offset += items.length;
  }
  await deleteStoragePaths(bucket, files);
  for (const folder of folders) {
    await removeStoragePrefix(bucket, folder);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const user = await authUserFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { user_id?: string; password?: string };
    if (body.user_id && body.user_id !== user.id) {
      return json({ error: "you can only delete your own account" }, 403);
    }

    const password = typeof body.password === "string" ? body.password : "";
    const passwordOk = password.trim().length > 0 && user.email
      ? await passwordMatches(user.email, password)
      : false;
    if (!passwordOk && !recentSignIn(user.lastSignInAt)) {
      return json({ error: friendlyDeleteError("Enter your current password to delete this account.") }, 401);
    }
    if (password.trim().length > 0 && !passwordOk) {
      return json({ error: friendlyDeleteError("Enter your current password to delete this account.") }, 401);
    }

    const purged = await restRpc("purge_account_owned_rows", { p_user_id: user.id });
    if (purged.error) return json({ error: friendlyDeleteError(purged.error), status: "blocked" }, 400);

    await removeStoragePrefix("project-photos", user.id).catch(() => undefined);
    await removeStoragePrefix("contractor-docs", user.id).catch(() => undefined);

    return json({ ok: true, deleted: true, status: "deleted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not delete account";
    const status = message === "not signed in" ? 401 : 400;
    return json({ error: message === "not signed in" ? message : friendlyDeleteError(message) }, status);
  }
});
