import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_STEP_UP_MESSAGE } from "./adminMfa";
import {
  AdminStepUpRequired,
  isAdminStepUpFailure,
  registerAdminStepUpHandler,
  runSensitiveAdminCall,
} from "./adminStepUp";

describe("admin step-up retry", () => {
  beforeEach(() => {
    registerAdminStepUpHandler(null);
  });

  it("recognizes the database error and not a normal admin refusal", () => {
    expect(isAdminStepUpFailure({ message: "admin step-up required" })).toBe(true);
    expect(isAdminStepUpFailure({ message: "only an admin can approve a contractor" })).toBe(false);
    expect(isAdminStepUpFailure(null)).toBe(false);
  });

  it("returns the first result while the database does not ask for a code", async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true }, error: null }));
    await expect(runSensitiveAdminCall(invoke, "Could not approve.")).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("asks for a code once and retries the same call", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "admin step-up required" } })
      .mockResolvedValueOnce({ data: { id: "row" }, error: null });
    const prompt = vi.fn(async () => true);
    registerAdminStepUpHandler(prompt);

    await expect(runSensitiveAdminCall(invoke, "Could not approve.")).resolves.toEqual({ id: "row" });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the admin cancels the code prompt", async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { message: "admin step-up required" } }));
    registerAdminStepUpHandler(async () => false);

    await expect(runSensitiveAdminCall(invoke, "Could not approve.")).rejects.toThrow(ADMIN_STEP_UP_MESSAGE);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("does not open a prompt when no admin shell is mounted", async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { message: "admin step-up required" } }));
    await expect(runSensitiveAdminCall(invoke, "Could not approve.")).rejects.toThrow(ADMIN_STEP_UP_MESSAGE);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("keeps a normal failure as the fallback sentence", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const invoke = vi.fn(async () => ({ data: null, error: { message: "contractor profile not found" } }));
    await expect(runSensitiveAdminCall(invoke, "Could not approve.")).rejects.toThrow("Could not approve.");
    spy.mockRestore();
  });

  it("uses a named error for the database signal", () => {
    expect(new AdminStepUpRequired().message).toBe("admin step-up required");
  });
});
