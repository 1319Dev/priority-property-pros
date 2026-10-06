import { describe, expect, it } from "vitest";
import { clearWizardSession, emptyWizardSession, readWizardSession, writeWizardSession } from "./wizardSession";

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
      storage,
    );
    const raw = storage.getItem("ppp.postProjectWizard") ?? "";
    expect(raw).not.toMatch(/projectId|status|DRAFT/);
    expect(readWizardSession(storage)).toMatchObject({
      step: 5,
      title: "HVAC",
      zipCode: "77301",
      categoryId: "cat-hvac",
    });
    clearWizardSession(storage);
    expect(readWizardSession(storage)).toBeNull();
  });

  it("ignores a broken session instead of inventing a project", () => {
    const storage = memoryStorage();
    storage.setItem("ppp.postProjectWizard", "{");
    expect(readWizardSession(storage)).toBeNull();
  });
});
