import { readWizardSession, wizardSessionIsEmpty } from "./lib/marketplace/wizardSession";

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
export const RELOAD_GUARD_MS = 15_000;
export const RELOAD_GUARD_KEY = "ppp-sw-reload-at";
export const UPDATE_TOAST_ID = "pwa-update-toast";
export const UPDATE_TOAST_GREEN = "#1A3C2E";
export const UPDATE_TOAST_GOLD = "#C9A227";
export const UPDATE_TOAST_GOLD_TEXT = "#E0C078";

export type UpdateAction = "reload" | "toast" | "ignore";

export function decideUpdateAction(input: {
  hadController: boolean;
  formDirty: boolean;
  alreadyHandled: boolean;
  reloadedAt: number | null;
  now: number;
}): UpdateAction {
  if (!input.hadController || input.alreadyHandled) return "ignore";
  if (input.reloadedAt != null && input.now - input.reloadedAt < RELOAD_GUARD_MS) return "ignore";
  if (input.formDirty) return "toast";
  return "reload";
}

type GuardStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readReloadGuard(storage: GuardStorage): number | null {
  try {
    const raw = storage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeReloadGuard(storage: GuardStorage, now: number) {
  try {
    storage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    // Private mode can reject writes. The in-memory handled flag still blocks a same-page loop.
  }
}

export type UpdateRuntime = {
  isDirty: () => boolean;
  reload: () => void;
  showToast: () => void;
  now: () => number;
  storage: GuardStorage;
};

export function createUpdateController(runtime: UpdateRuntime) {
  let handled = false;
  let sawController = false;

  function handle(hadController: boolean): UpdateAction {
    const action = decideUpdateAction({
      hadController,
      formDirty: runtime.isDirty(),
      alreadyHandled: handled,
      reloadedAt: readReloadGuard(runtime.storage),
      now: runtime.now(),
    });
    if (action === "reload") {
      handled = true;
      writeReloadGuard(runtime.storage, runtime.now());
      runtime.reload();
    } else if (action === "toast") {
      handled = true;
      runtime.showToast();
    }
    return action;
  }

  return {
    start(hasController: boolean) {
      sawController = hasController;
      return () => undefined;
    },
    onControllerChange() {
      const hadController = sawController;
      sawController = true;
      return handle(hadController);
    },
    onNeedReload() {
      sawController = true;
      return handle(true);
    },
    refresh() {
      writeReloadGuard(runtime.storage, runtime.now());
      runtime.reload();
    },
  };
}

function isIgnoredInput(input: HTMLInputElement): boolean {
  return (
    input.type === "hidden" ||
    input.type === "button" ||
    input.type === "submit" ||
    input.type === "reset" ||
    input.type === "image"
  );
}

function isField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !isIgnoredInput(target);
}

function fieldValue(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (field instanceof HTMLInputElement && field.type === "file") {
    return field.files && field.files.length > 0 ? String(field.files.length) : "";
  }
  if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
    return field.checked ? "on" : "off";
  }
  return field.value;
}

function openWizardDraft(doc: Document, storage: GuardStorage): boolean {
  if (!doc.querySelector("[data-pwa-form='project-wizard']")) return false;
  try {
    const session = readWizardSession(storage);
    return session != null && !wizardSessionIsEmpty(session);
  } catch {
    return false;
  }
}

export function createFormDirtyTracker(doc: Document, storage: GuardStorage = sessionStorage) {
  const initial = new WeakMap<EventTarget, string>();
  const dirtyFields = new Set<EventTarget>();
  const engaged = new Set<Element>();

  function remember(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
    if (!initial.has(field)) initial.set(field, fieldValue(field));
  }

  function onFocusIn(event: Event) {
    if (isField(event.target)) remember(event.target);
  }

  function onEdit(event: Event) {
    if (!isField(event.target)) return;
    if (!initial.has(event.target)) initial.set(event.target, "");
    if (fieldValue(event.target) !== initial.get(event.target)) dirtyFields.add(event.target);
    else dirtyFields.delete(event.target);
  }

  function onEngage(event: Event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const zone = target.closest("[data-pwa-form]");
    if (!zone) return;
    if (target.closest("button, input, textarea, select, label, [role='radio'], [role='checkbox'], [role='tab']")) {
      engaged.add(zone);
    }
  }

  function onSubmit(event: Event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    for (const element of Array.from(form.elements)) {
      if (!isField(element)) continue;
      initial.set(element, fieldValue(element));
      dirtyFields.delete(element);
    }
    const zone = form.closest("[data-pwa-form]");
    if (zone) engaged.delete(zone);
  }

  doc.addEventListener("focusin", onFocusIn, true);
  doc.addEventListener("input", onEdit, true);
  doc.addEventListener("change", onEdit, true);
  doc.addEventListener("pointerdown", onEngage, true);
  doc.addEventListener("click", onEngage, true);
  doc.addEventListener("submit", onSubmit, true);

  return {
    isDirty() {
      for (const field of dirtyFields) {
        if (!(field instanceof Node) || !field.isConnected) {
          dirtyFields.delete(field);
          continue;
        }
        return true;
      }
      for (const zone of engaged) {
        if (!zone.isConnected) {
          engaged.delete(zone);
          continue;
        }
        return true;
      }
      return openWizardDraft(doc, storage);
    },
    stop() {
      doc.removeEventListener("focusin", onFocusIn, true);
      doc.removeEventListener("input", onEdit, true);
      doc.removeEventListener("change", onEdit, true);
      doc.removeEventListener("pointerdown", onEngage, true);
      doc.removeEventListener("click", onEngage, true);
      doc.removeEventListener("submit", onSubmit, true);
    },
  };
}

export function showUpdateToast(doc: Document, onRefresh: () => void) {
  if (!doc.body || doc.getElementById(UPDATE_TOAST_ID)) return;
  const toast = doc.createElement("div");
  toast.id = UPDATE_TOAST_ID;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.style.position = "fixed";
  toast.style.zIndex = "70";
  toast.style.top = "calc(4.75rem + env(safe-area-inset-top))";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.boxSizing = "border-box";
  toast.style.width = "max-content";
  toast.style.maxWidth = "calc(100vw - 2rem)";
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.gap = "0.75rem";
  toast.style.padding = "0.65rem 0.75rem 0.65rem 1rem";
  toast.style.borderRadius = "999px";
  toast.style.backgroundColor = UPDATE_TOAST_GREEN;
  toast.style.color = UPDATE_TOAST_GOLD_TEXT;
  toast.style.borderStyle = "solid";
  toast.style.borderWidth = "1px";
  toast.style.borderColor = UPDATE_TOAST_GOLD;
  toast.style.boxShadow = "0 12px 32px rgba(26, 60, 46, 0.28)";
  toast.style.font = "600 0.875rem/1.35 Outfit, ui-sans-serif, system-ui, sans-serif";
  toast.style.pointerEvents = "auto";

  const message = doc.createElement("span");
  message.textContent = "A new version is ready. ";
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "Refresh";
  button.style.backgroundColor = UPDATE_TOAST_GOLD;
  button.style.color = UPDATE_TOAST_GREEN;
  button.style.border = "0";
  button.style.borderRadius = "999px";
  button.style.minHeight = "44px";
  button.style.padding = "0.35rem 0.9rem";
  button.style.font = "inherit";
  button.style.cursor = "pointer";
  button.addEventListener("click", () => onRefresh());

  toast.append(message, button);
  doc.body.append(toast);
}

export function startUpdateChecks(
  registration: { update: () => Promise<unknown> },
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
): () => void {
  let stopped = false;
  const check = () => {
    if (stopped) return;
    void registration.update().catch(() => undefined);
  };
  const onFocus = () => check();
  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  const timer = window.setInterval(check, intervalMs);
  return () => {
    stopped = true;
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearInterval(timer);
  };
}
