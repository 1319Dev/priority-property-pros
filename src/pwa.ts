import { registerSW } from "virtual:pwa-register";
import { createFormDirtyTracker, createUpdateController, showUpdateToast, startUpdateChecks } from "./pwaUpdate";

const forms = createFormDirtyTracker(document, sessionStorage);
const refreshPage = {
  run: () => window.location.reload(),
};

const updates = createUpdateController({
  isDirty: () => forms.isDirty(),
  reload: () => window.location.reload(),
  showToast: () => showUpdateToast(document, () => refreshPage.run()),
  now: () => Date.now(),
  storage: sessionStorage,
});

refreshPage.run = () => updates.refresh();

if ("serviceWorker" in navigator) {
  updates.start(Boolean(navigator.serviceWorker.controller));
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    updates.onControllerChange();
  });
}

registerSW({
  immediate: true,
  onNeedReload() {
    updates.onNeedReload();
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) startUpdateChecks(registration);
  },
});
