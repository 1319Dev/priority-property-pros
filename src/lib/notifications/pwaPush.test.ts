import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("injectManifest service worker", () => {
  it("keeps precaching and handles push plus notification clicks", () => {
    const vite = readFileSync(path.join(repoRoot, "vite.config.ts"), "utf8");
    const worker = readFileSync(path.join(repoRoot, "src/sw.ts"), "utf8");
    const vapid = readFileSync(path.join(repoRoot, "src/lib/notifications/vapid.ts"), "utf8");
    expect(vite).toMatch(/strategies:\s*"injectManifest"/);
    expect(vite).toMatch(/filename:\s*"sw.ts"/);
    expect(vite).toMatch(/registerType:\s*"autoUpdate"/);
    expect(worker).toMatch(/createHandlerBoundToURL\("index.html"\)/);
    expect(worker).toMatch(/offline\\?\.html/);
    expect(worker).toMatch(/cache:\s*"reload"/);
    expect(worker).toMatch(/addEventListener\("install"/);
    expect(worker).toMatch(/self\.skipWaiting\(\)/);
    expect(worker).toMatch(/clientsClaim\(\)/);
    expect(worker).toMatch(/self\.clients\.claim\(\)/);
    expect(worker).toMatch(/cleanupOutdatedCaches\(\)/);
    expect(worker).toMatch(/precacheAndRoute\(self\.__WB_MANIFEST\)/);
    expect(worker.indexOf("new NavigationRoute")).toBeGreaterThan(-1);
    expect(worker.indexOf("new NavigationRoute")).toBeLessThan(worker.indexOf("precacheAndRoute(self.__WB_MANIFEST)"));
    expect(worker).toMatch(/addEventListener\("push"/);
    expect(worker).toMatch(/addEventListener\("notificationclick"/);
    expect(worker).toMatch(/clients\.openWindow/);
    expect(vapid).toMatch(/COMMITTED_VAPID_PUBLIC_KEY/);
    expect(vapid).not.toMatch(/VAPID_PRIVATE_KEY/);
    expect(worker).not.toMatch(/VAPID_PRIVATE_KEY/);
  });
});
