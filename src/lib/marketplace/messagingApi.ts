import { getSupabaseClient } from "../supabase/client";
import {
  assertMessageBodyAllowed,
  customerFacingMessageError,
  sanitizeProjectMessage,
  sanitizeThreadSummary,
  type MessageThreadSummary,
  type ProjectMessage,
} from "./messaging";
import { isUuid } from "./recordId";

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

export async function listMyMessageThreads(): Promise<MessageThreadSummary[]> {
  const { data, error } = await client().rpc("list_my_message_threads");
  if (error) throw new Error("Could not load messages.");
  const rows = Array.isArray(data) ? data : [];
  return rows.map(sanitizeThreadSummary).filter((row): row is MessageThreadSummary => row != null);
}

export async function ensureMessageThread(projectId: string, contractorProfileId: string): Promise<string> {
  if (!isUuid(projectId) || !isUuid(contractorProfileId)) throw new Error("We couldn't find that conversation.");
  const { data, error } = await client().rpc("ensure_message_thread", {
    p_project_id: projectId,
    p_contractor_profile_id: contractorProfileId,
  });
  if (error) throw new Error(customerFacingMessageError(error.message));
  const payload = (data ?? {}) as { thread_id?: unknown };
  if (typeof payload.thread_id !== "string") throw new Error(customerFacingMessageError("messaging is locked"));
  return payload.thread_id;
}

export async function listProjectMessages(threadId: string): Promise<ProjectMessage[]> {
  const { data, error } = await client()
    .from("project_messages")
    .select("id, thread_id, sender_profile_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load this thread.");
  return (data ?? []).map(sanitizeProjectMessage).filter((row): row is ProjectMessage => row != null);
}

export async function markMessageThreadRead(threadId: string): Promise<void> {
  const { error } = await client().rpc("mark_message_thread_read", { p_thread_id: threadId });
  if (error) throw new Error("Could not update this conversation.");
}

export async function sendProjectMessage(threadId: string, senderProfileId: string, body: string): Promise<void> {
  const clean = assertMessageBodyAllowed(body);
  const { error } = await client().from("project_messages").insert({
    thread_id: threadId,
    sender_profile_id: senderProfileId,
    body: clean,
  });
  if (error) throw new Error(customerFacingMessageError(error.message));
}

export function subscribeToProjectMessages(threadId: string, onInsert: () => void): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => undefined;
  const channel = supabase
    .channel(`project-messages:${threadId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "project_messages", filter: `thread_id=eq.${threadId}` },
      () => onInsert(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
