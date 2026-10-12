import { describe, expect, it } from "vitest";
import { clearWizardSession, hasUnsavedWizardDraft, emptyWizardSession, readWizardSession, writeWizardSession } from "./wizardSession";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("in-tab project form", () => {
  it("stores the form without a project id or draft status", () => {
    const storage = memoryStorage();
    writeWizardSession(
      {
        ...emptyWizardSession(),
        step: 5,
        title: "HVAC",
        zipCode: "77301",
        categoryId: "cat-hvac",
      },
      "user-1",
      storage,
    );
    const raw = storage.getItem("ppp.postProjectWizard") ?? "";
    expect(raw).not.toMatch(/projectId|status|DRAFT/);
    expect(readWizardSession("user-1", storage)).toMatchObject({
      step: 5,
      title: "HVAC",
      zipCode: "77301",
      categoryId: "cat-hvac",
    });
    clearWizardSession(storage);
    expect(readWizardSession("user-1", storage)).toBeNull();
  });

  it("ignores a broken session instead of inventing a project", () => {
    const storage = memoryStorage();
    storage.setItem("ppp.postProjectWizard", "{");
    expect(readWizardSession("user-1", storage)).toBeNull();
  });

  it("only returns a draft to the account that typed it", () => {
    const storage = memoryStorage();
    writeWizardSession({ ...emptyWizardSession(), title: "Fence", street: "100 Test St" }, "user-a", storage);
    expect(hasUnsavedWizardDraft(storage)).toBe(true);
    expect(readWizardSession("user-b", storage)).toBeNull();
    // The other account's draft is removed, so it cannot come back later either.
    expect(storage.getItem("ppp.postProjectWizard")).toBeNull();
    expect(readWizardSession("user-a", storage)).toBeNull();
  });

  it("does not save or read a draft without a signed-in owner", () => {
    const storage = memoryStorage();
    writeWizardSession({ ...emptyWizardSession(), title: "Fence" }, null, storage);
    expect(storage.getItem("ppp.postProjectWizard")).toBeNull();
    storage.setItem("ppp.postProjectWizard", JSON.stringify({ ...emptyWizardSession(), title: "Legacy" }));
    expect(readWizardSession(undefined, storage)).toBeNull();
    expect(hasUnsavedWizardDraft(storage)).toBe(false);
    expect(readWizardSession("user-a", storage)).toBeNull();
    expect(storage.getItem("ppp.postProjectWizard")).toBeNull();
  });
});
