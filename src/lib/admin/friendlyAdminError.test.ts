import { describe, expect, it, vi } from "vitest";
import { friendlyAdminError } from "./friendlyAdminError";

describe("friendlyAdminError", () => {
  it("hides raw database text and keeps a useful fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(friendlyAdminError({ code: "42501", message: "not authorized" }, "Could not load.")).toBe(
      "You need an admin sign-in to do that.",
    );
    expect(friendlyAdminError({ message: "duplicate key value violates unique constraint \"profiles_pkey\"" }, "Could not save.")).toBe(
      "That record already exists.",
    );
    expect(friendlyAdminError({ message: "relation \"secret\" does not exist" }, "Could not load the queue.")).toBe(
      "Could not load the queue.",
    );
    expect(
      friendlyAdminError({ message: "You need an admin sign-in to do that." }, "Could not load the queue."),
    ).toBe("You need an admin sign-in to do that.");
    expect(
      friendlyAdminError(
        { message: "Could not find the function public.admin_list_portfolio_review_queue in the schema cache" },
        "Could not load photos waiting for review.",
      ),
    ).toBe("Could not load photos waiting for review.");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
