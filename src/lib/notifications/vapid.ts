/**
 * Public Web Push key. Safe to ship in the website.
 * The matching secret stays in Edge Function secrets and is not in git.
 */
export const COMMITTED_VAPID_PUBLIC_KEY =
  "BNDw0fffn8KbQFPY4YDftF3vyW4KAhc8hnnPZYvdV_KXtOsg2S4nop3Mt2g_KTcW90boLiYWO2R0-BQau-DoWqg";

export function vapidPublicKey(): string {
  const fromEnv = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "").trim();
  return fromEnv || COMMITTED_VAPID_PUBLIC_KEY;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}
