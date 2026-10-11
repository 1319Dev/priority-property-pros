import { friendlyAdminError } from "./friendlyAdminError";
import { getSupabaseClient } from "../supabase/client";

export type ContactMessage = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string | null;
  topic: string;
  message: string;
  emailStatus: string;
  handledAt: string | null;
};

const COLUMNS = "id, created_at, name, email, phone, topic, message, email_status, handled_at";

function fail(error: { message?: string; code?: string } | null, fallback: string): never {
  throw new Error(friendlyAdminError(error, fallback));
}

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function parseContactMessage(value: unknown): ContactMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = readText(row.id);
  const createdAt = readText(row.created_at);
  const name = readText(row.name);
  const email = readText(row.email);
  const topic = readText(row.topic);
  const message = readText(row.message);
  const emailStatus = readText(row.email_status);
  if (!id || !createdAt || !name || !email || !topic || !message || !emailStatus) return null;
  return {
    id,
    createdAt,
    name,
    email,
    phone: readText(row.phone),
    topic,
    message,
    emailStatus,
    handledAt: readText(row.handled_at),
  };
}

export function contactEmailWasSent(status: string): boolean {
  return status === "sent";
}

export async function listContactMessages(): Promise<ContactMessage[]> {
  const { data, error } = await client()
    .from("contact_messages")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail(error, "Could not load contact messages.");
  if (!Array.isArray(data)) return [];
  return data.map(parseContactMessage).filter((row): row is ContactMessage => row != null);
}

export async function getContactMessage(id: string): Promise<ContactMessage | null> {
  const { data, error } = await client().from("contact_messages").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) fail(error, "Could not load that message.");
  return parseContactMessage(data);
}

export async function markContactMessageHandled(id: string): Promise<string | null> {
  const { data, error } = await client().rpc("admin_mark_contact_message_handled", { p_id: id });
  if (error) fail(error, "Could not mark that message handled.");
  if (!data || typeof data !== "object") return null;
  return readText((data as { handled_at?: unknown }).handled_at);
}

export async function fetchUnhandledContactCount(): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("admin_unhandled_contact_message_count");
  if (error) throw new Error(friendlyAdminError(error, "Could not count contact messages."));
  if (typeof data === "number" && Number.isFinite(data)) return Math.max(0, Math.trunc(data));
  if (typeof data === "string" && data.trim() !== "") {
    const parsed = Number(data);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }
  return 0;
}
