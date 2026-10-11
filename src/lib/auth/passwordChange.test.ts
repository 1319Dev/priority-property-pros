import { describe, expect, it, vi } from "vitest";
import { changePassword, passwordChangeFormError, passwordUpdateMessage, type PasswordChangeDeps } from "./passwordChange";

function deps(overrides: Partial<PasswordChangeDeps> = {}): PasswordChangeDeps {
  return {
    verifyCurrent: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

const base = { email: "home@example.com", currentPassword: "old-password", newPassword: "new-pass-1", confirmPassword: "new-pass-1" };

describe("Account password change", () => {
  it("requires the current password and an 8-character new password", () => {
    expect(passwordChangeFormError({ ...base, currentPassword: "" })?.ok).toBe(false);
    expect(passwordChangeFormError({ ...base, newPassword: "1234567", confirmPassword: "1234567" })).toMatchObject({
      field: "new",
      message: "Use at least 8 characters.",
    });
    expect(passwordChangeFormError({ ...base, newPassword: "12345678", confirmPassword: "12345678" })).toBeNull();
    expect(passwordChangeFormError({ ...base, confirmPassword: "different" })).toMatchObject({ field: "confirm" });
    expect(passwordChangeFormError({ ...base, newPassword: "old-password", confirmPassword: "old-password" })).toMatchObject({
      field: "new",
    });
  });

  it("re-checks the current password before changing it", async () => {
    const d = deps();
    await expect(changePassword(base, d)).resolves.toEqual({ ok: true });
    expect(d.verifyCurrent).toHaveBeenCalledWith("home@example.com", "old-password");
    expect(d.update).toHaveBeenCalledWith("new-pass-1", "old-password");
  });

  it("does not change anything when the current password is wrong", async () => {
    const d = deps({ verifyCurrent: vi.fn().mockResolvedValue({ error: { message: "Invalid login credentials", code: "invalid_credentials", status: 400 } }) });
    await expect(changePassword(base, d)).resolves.toEqual({ ok: false, field: "current", message: "Your current password is not right." });
    expect(d.update).not.toHaveBeenCalled();
  });

  it("does not call the server for a short password", async () => {
    const d = deps();
    const result = await changePassword({ ...base, newPassword: "short", confirmPassword: "short" }, d);
    expect(result.ok).toBe(false);
    expect(d.verifyCurrent).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it("maps Supabase errors to plain messages", () => {
    expect(passwordUpdateMessage({ code: "same_password", message: "New password should be different from the old password." })).toMatch(/different/);
    expect(passwordUpdateMessage({ code: "weak_password", message: "Password should be at least 8 characters." })).toBe("Use at least 8 characters.");
    expect(passwordUpdateMessage({ code: "reauthentication_needed", message: "Password update requires reauthentication" })).toMatch(/Forgot password/);
    expect(passwordUpdateMessage({ status: 429, message: "rate limit" })).toMatch(/Too many tries/);
    expect(passwordUpdateMessage({ message: "boom" })).toBe("We couldn't change your password. Try again.");
  });

  it("reports rate limits on the re-check without blaming the password", async () => {
    const d = deps({ verifyCurrent: vi.fn().mockResolvedValue({ error: { message: "Request rate limit reached", status: 429 } }) });
    await expect(changePassword(base, d)).resolves.toEqual({ ok: false, message: "Too many tries. Wait a few minutes and try again." });
  });
});
