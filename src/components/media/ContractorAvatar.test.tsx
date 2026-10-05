import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CONTRACTOR_PLACEHOLDER_LABEL, ContractorAvatar } from "./ContractorAvatar";

describe("ContractorAvatar", () => {
  it("uses the branded placeholder when a contractor has no uploaded photo", () => {
    render(<ContractorAvatar />);
    expect(screen.getByRole("img", { name: CONTRACTOR_PLACEHOLDER_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /uploaded contractor profile photo/i })).not.toBeInTheDocument();
  });

  it("prefers an uploaded photo over the placeholder", () => {
    render(<ContractorAvatar photoUrl="/photos/pro.jpg" />);
    const img = screen.getByRole("img", { name: /uploaded contractor profile photo/i });
    expect(img).toHaveAttribute("src", "/photos/pro.jpg");
    expect(img).toHaveAttribute("width", "48");
    expect(img).toHaveAttribute("height", "48");
    expect(screen.queryByRole("img", { name: CONTRACTOR_PLACEHOLDER_LABEL })).not.toBeInTheDocument();
  });
});
