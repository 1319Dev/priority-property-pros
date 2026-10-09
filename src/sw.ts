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

type AppShellHandler = ReturnType<typeof createHandlerBoundToURL>;

let precachedIndex: AppShellHandler | undefined;

function appShellRequest(): Request {
  return new Request(new URL("index.html", self.registration.scope), {
    cache: "reload",
    credentials: "same-origin",
  });
}

async function networkFirstIndexHtml(options: Parameters<AppShellHandler>[0]): Promise<Response> {
  try {
    const response = await fetch(appShellRequest());
    if (response.ok) return response;
  } catch {
    // Offline or the connection failed. Fall back to the precached shell.
  }
  precachedIndex ??= createHandlerBoundToURL("index.html");
  return precachedIndex(options);
}

const workerLifecycle = {
  skipWaiting() {
    return self.skipWaiting();
  },
  clientsClaim() {
    return self.clients.claim();
  },
};

self.addEventListener("install", (event) => {
  event.waitUntil(workerLifecycle.skipWaiting());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void workerLifecycle.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(workerLifecycle.clientsClaim());
});

// Navigations read index.html from the network so a refresh sees the new build.
// Hashed assets stay on the precache route below, which is cache-first.
registerRoute(
  new NavigationRoute(networkFirstIndexHtml, {
    denylist: [/offline\.html$/],
  }),
);

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

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
