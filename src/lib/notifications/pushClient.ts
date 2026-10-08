import { countMyPushSubscriptions, deletePushSubscription, enablePushOnAllCategories, savePushSubscription } from "./api";
import { urlBase64ToUint8Array, vapidPublicKey } from "./vapid";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function currentPushEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function enableBrowserPush(): Promise<{ ok: true; endpoint: string } | { ok: false; message: string }> {
  if (!pushSupported()) {
    return { ok: false, message: "This browser does not support push alerts." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      message: "Push is blocked in this browser. Allow notifications in the browser settings, then try again.",
    };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey()),
      }));
    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys.auth) {
      return { ok: false, message: "This browser did not return push keys." };
    }
    const before = await countMyPushSubscriptions();
    await savePushSubscription({
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: navigator.userAgent,
    });
    if (before === 0) await enablePushOnAllCategories();
    return { ok: true, endpoint: subscription.endpoint };
  } catch {
    return { ok: false, message: "Push could not be turned on in this browser." };
  }
}

export async function disableBrowserPush(endpoint: string): Promise<void> {
  if (pushSupported()) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && subscription.endpoint === endpoint) await subscription.unsubscribe();
  }
  await deletePushSubscription(endpoint);
}
