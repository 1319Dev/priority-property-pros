import { describe, expect, it } from "vitest";
import { dropdownRightInset } from "./notificationPanelLayout";

describe("dropdownRightInset", () => {
  it("leaves a panel that already clears the left margin", () => {
    expect(dropdownRightInset(48)).toBe(0);
    expect(dropdownRightInset(12)).toBe(0);
  });

  it("shifts a panel that crosses the left edge back onto the screen", () => {
    expect(dropdownRightInset(-20)).toBe(-32);
    expect(dropdownRightInset(0)).toBe(-12);
    expect(dropdownRightInset(4, 12)).toBe(-8);
  });
});
