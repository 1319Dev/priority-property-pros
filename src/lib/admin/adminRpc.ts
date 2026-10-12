import { friendlyAdminError } from "./friendlyAdminError";
import { getSupabaseClient } from "../supabase/client";

type RpcError = { message?: string; code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };

/**
 * Admin RPCs are not all listed on the generated client yet.
 * Each one still checks is_admin() on the server. This wrapper only calls them.
 */
export async function adminRpc(name: string, args: Record<string, unknown>, fallback: string): Promise<unknown> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const call = supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<RpcResult>;
  const { data, error } = await call(name, args);
  if (error) throw new Error(friendlyAdminError(error, fallback));
  return data;
}
