import { describe, expect, it } from "vitest";
import { showTestingConfirmButton } from "./testingConfirm";

describe("showTestingConfirmButton", () => {
  it("hides the no-charge confirm control in production and leaves it in local builds", () => {
    expect(showTestingConfirmButton(true)).toBe(false);
    expect(showTestingConfirmButton(false)).toBe(true);
  });
});
