import { json, optionsResponse } from "../_shared/cors.ts";
import { restRpc, userIdFromRequest } from "../_shared/supabase.ts";

async function deleteAuthUser(userId: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "could not close the auth user");
  }
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
    const userId = await userIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { user_id?: string };
    if (body.user_id && body.user_id !== userId) {
      return json({ error: "you can only delete your own account" }, 403);
    }

    const purged = await restRpc("purge_account_owned_rows", { p_user_id: userId });
    if (purged.error) return json({ error: purged.error }, 400);

    await removeStoragePrefix("project-photos", userId).catch(() => undefined);
    await removeStoragePrefix("contractor-docs", userId).catch(() => undefined);

    await deleteAuthUser(userId);
    return json({ ok: true, deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not delete account";
    const status = message === "not signed in" ? 401 : 400;
    return json({ error: message }, status);
  }
});
