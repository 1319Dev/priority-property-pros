import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JobReference } from "../../components/marketplace/JobReference";
import { formatProjectReference, parseProjectReference } from "./projectReference";

describe("project reference formatting", () => {
  it("formats a stored number as PPP-n", () => {
    expect(formatProjectReference(1042)).toBe("PPP-1042");
    expect(formatProjectReference("1001")).toBe("PPP-1001");
  });

  it("hides missing or invalid numbers so the UI can ship before the column exists", () => {
    expect(formatProjectReference(null)).toBeNull();
    expect(formatProjectReference(undefined)).toBeNull();
    expect(formatProjectReference("")).toBeNull();
    expect(formatProjectReference(0)).toBeNull();
    expect(formatProjectReference(1.5)).toBeNull();
    expect(formatProjectReference(-4)).toBeNull();
    expect(formatProjectReference("PPP-1042")).toBeNull();
  });
});

describe("project reference parsing", () => {
  it("accepts the display form or the bare number", () => {
    expect(parseProjectReference("PPP-1042")).toBe(1042);
    expect(parseProjectReference("ppp-1042")).toBe(1042);
    expect(parseProjectReference("PPP 1042")).toBe(1042);
    expect(parseProjectReference("1042")).toBe(1042);
    expect(parseProjectReference("  1001  ")).toBe(1001);
  });

  it("rejects anything that is not a job reference", () => {
    expect(parseProjectReference("")).toBeNull();
    expect(parseProjectReference("PPP-")).toBeNull();
    expect(parseProjectReference("PPP-1042 extra")).toBeNull();
    expect(parseProjectReference("job 1042")).toBeNull();
    expect(parseProjectReference("0")).toBeNull();
    expect(parseProjectReference("-5")).toBeNull();
    expect(parseProjectReference("abc")).toBeNull();
  });
});

describe("JobReference", () => {
  it("shows the muted label and copies it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<JobReference value={1042} />);
    expect(screen.getByText("PPP-1042")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy PPP-1042" }));
    expect(writeText).toHaveBeenCalledWith("PPP-1042");
    expect(await screen.findByRole("button", { name: "Copied PPP-1042" })).toBeInTheDocument();
  });

  it("renders nothing when the project has no reference yet", () => {
    const { container } = render(<JobReference value={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
