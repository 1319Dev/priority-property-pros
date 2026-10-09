import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearWizardSession, emptyWizardSession, writeWizardSession } from "./lib/marketplace/wizardSession";
import {
  RELOAD_GUARD_KEY,
  RELOAD_GUARD_MS,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_TOAST_GOLD,
  UPDATE_TOAST_GOLD_TEXT,
  UPDATE_TOAST_GREEN,
  UPDATE_TOAST_ID,
  createFormDirtyTracker,
  createUpdateController,
  decideUpdateAction,
  showUpdateToast,
  startUpdateChecks,
} from "./pwaUpdate";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function colorMatches(value: string, hex: string): boolean {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return normalized === hex.toLowerCase() || normalized === `rgb(${channels.join(",")})`;
}

describe("decideUpdateAction", () => {
  const base = {
    hadController: true,
    formDirty: false,
    alreadyHandled: false,
    reloadedAt: null,
    now: 50_000,
  };

  it("reloads once a controlling worker is replaced and the form is clean", () => {
    expect(decideUpdateAction(base)).toBe("reload");
  });

  it("ignores the first controller and a repeat or a recent reload", () => {
    expect(decideUpdateAction({ ...base, hadController: false })).toBe("ignore");
    expect(decideUpdateAction({ ...base, alreadyHandled: true })).toBe("ignore");
    expect(decideUpdateAction({ ...base, reloadedAt: base.now - 1_000 })).toBe("ignore");
  });

  it("toasts instead of reloading when a form is dirty", () => {
    expect(decideUpdateAction({ ...base, formDirty: true })).toBe("toast");
    expect(decideUpdateAction({ ...base, formDirty: true, reloadedAt: base.now - RELOAD_GUARD_MS })).toBe("toast");
  });

  it("reloads again once the guard window has elapsed", () => {
    expect(decideUpdateAction({ ...base, reloadedAt: base.now - RELOAD_GUARD_MS })).toBe("reload");
  });
});

describe("createUpdateController", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  function runtime(overrides: { dirty?: boolean; now?: number } = {}) {
    const reload = vi.fn();
    const showToast = vi.fn();
    let now = overrides.now ?? 20_000;
    const controller = createUpdateController({
      isDirty: () => overrides.dirty ?? false,
      reload,
      showToast,
      now: () => now,
      storage: sessionStorage,
    });
    return {
      controller,
      reload,
      showToast,
      setNow(value: number) {
        now = value;
      },
    };
  }

  it("reloads on the first real controller change and ignores the rest", () => {
    const { controller, reload, showToast } = runtime();
    const stop = controller.start(false);
    expect(controller.onControllerChange()).toBe("ignore");
    expect(controller.onControllerChange()).toBe("reload");
    expect(controller.onControllerChange()).toBe("ignore");
    expect(controller.onNeedReload()).toBe("ignore");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RELOAD_GUARD_KEY)).toBe("20000");
    stop();
  });

  it("shows the refresh toast instead of reloading a dirty form", () => {
    const { controller, reload, showToast } = runtime({ dirty: true });
    const stop = controller.start(true);
    expect(controller.onNeedReload()).toBe("toast");
    expect(controller.onControllerChange()).toBe("ignore");
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it("does not reload again immediately after a guarded refresh", () => {
    const { controller, reload, setNow } = runtime({ now: 5_000 });
    const stop = controller.start(true);
    sessionStorage.setItem(RELOAD_GUARD_KEY, "4000");
    expect(controller.onControllerChange()).toBe("ignore");
    setNow(4_000 + RELOAD_GUARD_MS);
    expect(controller.onControllerChange()).toBe("reload");
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("form dirty tracking", () => {
  const trackers: Array<{ stop: () => void }> = [];

  afterEach(() => {
    for (const tracker of trackers) tracker.stop();
    trackers.length = 0;
    document.body.replaceChildren();
    clearWizardSession();
  });

  function track() {
    const tracker = createFormDirtyTracker(document, sessionStorage);
    trackers.push(tracker);
    return tracker;
  }

  it("marks an edited estimate field dirty and clears it when the value is restored", () => {
    const zone = document.createElement("div");
    zone.dataset.pwaForm = "estimate";
    const notes = document.createElement("textarea");
    notes.value = "Saved note";
    zone.append(notes);
    document.body.append(zone);
    const tracker = track();

    expect(tracker.isDirty()).toBe(false);
    notes.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    notes.value = "Saved note plus a new line";
    notes.dispatchEvent(new Event("input", { bubbles: true }));
    expect(tracker.isDirty()).toBe(true);
    notes.value = "Saved note";
    notes.dispatchEvent(new Event("input", { bubbles: true }));
    expect(tracker.isDirty()).toBe(false);
  });

  it("treats a wizard draft and in-form controls as mid-form", () => {
    const zone = document.createElement("div");
    zone.dataset.pwaForm = "project-wizard";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Continue";
    zone.append(button);
    document.body.append(zone);
    writeWizardSession({ ...emptyWizardSession(), title: "Fence repair" });
    const tracker = track();

    expect(tracker.isDirty()).toBe(true);
    zone.remove();
    expect(tracker.isDirty()).toBe(false);

    document.body.append(zone);
    clearWizardSession();
    expect(tracker.isDirty()).toBe(false);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(tracker.isDirty()).toBe(true);
  });

  it("treats a selected photo as dirty and ignores a detached field", () => {
    const input = document.createElement("input");
    input.type = "file";
    Object.defineProperty(input, "files", { value: { length: 1 } });
    document.body.append(input);
    const tracker = track();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(tracker.isDirty()).toBe(true);
    input.remove();
    expect(tracker.isDirty()).toBe(false);
  });

  it("clears a submitted form so a finished sign-in does not block the update", () => {
    const form = document.createElement("form");
    const email = document.createElement("input");
    form.append(email);
    document.body.append(form);
    const tracker = track();
    email.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    email.value = "ada@example.com";
    email.dispatchEvent(new Event("input", { bubbles: true }));
    expect(tracker.isDirty()).toBe(true);
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(tracker.isDirty()).toBe(false);
  });
});

describe("update toast", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("shows one green and gold refresh toast that does not cover the page", () => {
    const refresh = vi.fn();
    showUpdateToast(document, refresh);
    showUpdateToast(document, refresh);
    const toast = document.getElementById(UPDATE_TOAST_ID);
    expect(toast).not.toBeNull();
    expect(document.querySelectorAll(`#${UPDATE_TOAST_ID}`)).toHaveLength(1);
    expect(toast?.textContent?.replace(/\s+/g, " ").trim()).toBe("A new version is ready. Refresh");
    expect(toast?.getAttribute("role")).toBe("status");
    expect(colorMatches(toast?.style.backgroundColor ?? "", UPDATE_TOAST_GREEN)).toBe(true);
    expect(colorMatches(toast?.style.color ?? "", UPDATE_TOAST_GOLD_TEXT)).toBe(true);
    expect(colorMatches(toast?.style.borderColor ?? "", UPDATE_TOAST_GOLD)).toBe(true);
    expect(toast?.style.position).toBe("fixed");
    expect(toast?.style.maxWidth).toBe("calc(100vw - 2rem)");
    const button = toast?.querySelector("button");
    expect(button?.type).toBe("button");
    expect(colorMatches(button?.style.backgroundColor ?? "", UPDATE_TOAST_GOLD)).toBe(true);
    expect(colorMatches(button?.style.color ?? "", UPDATE_TOAST_GREEN)).toBe(true);
    button?.click();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("startUpdateChecks", () => {
  let stop = () => {};

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("calls registration.update on window focus and when the tab becomes visible", () => {
    const update = vi.fn().mockResolvedValue(undefined);
    stop = startUpdateChecks({ update });
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("calls registration.update every 30 minutes", () => {
    vi.useFakeTimers();
    const update = vi.fn().mockResolvedValue(undefined);
    stop = startUpdateChecks({ update });
    expect(update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("swallows a failed update check", async () => {
    const update = vi.fn().mockRejectedValue(new Error("offline"));
    stop = startUpdateChecks({ update });
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("pwa wiring", () => {
  it("keeps auto-update registration pointed at the wizard and estimate forms", () => {
    const pwa = readFileSync(path.join(repoRoot, "src/pwa.ts"), "utf8");
    const wizard = readFileSync(path.join(repoRoot, "src/pages/app/customer/ProjectWizardPage.tsx"), "utf8");
    const estimate = readFileSync(path.join(repoRoot, "src/pages/app/pro/ProMarketplacePages.tsx"), "utf8");
    const vite = readFileSync(path.join(repoRoot, "vite.config.ts"), "utf8");
    expect(vite).toMatch(/registerType:\s*"autoUpdate"/);
    expect(pwa).toContain("controllerchange");
    expect(pwa).toContain("onNeedReload");
    expect(pwa).toContain("startUpdateChecks");
    expect(wizard).toContain('data-pwa-form="project-wizard"');
    expect(estimate).toContain('data-pwa-form="estimate"');
    expect(pwa).not.toMatch(/stripe|signupFee|notification preference/i);
  });
});
