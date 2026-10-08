/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

type PushPayload = {
  title?: string;
  body?: string;
  path?: string;
  tag?: string;
};

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/offline\.html$/],
  }),
);

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function notificationTarget(path: string | undefined): string {
  const relative = (path && path.startsWith("/") ? path.slice(1) : path) || "";
  return new URL(relative, self.registration.scope).href;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title || "Priority Property Pros";
  const body = payload.body || "You have a new alert on Priority Property Pros";
  const path = typeof payload.path === "string" ? payload.path : "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag,
      data: { path },
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { path?: string } | undefined;
  const target = notificationTarget(data?.path);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const targetUrl = new URL(target);
      for (const windowClient of windows) {
        if (new URL(windowClient.url).pathname === targetUrl.pathname && "focus" in windowClient) {
          await windowClient.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
