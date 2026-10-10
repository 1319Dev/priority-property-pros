import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortfolioPhotoFrame } from "./PortfolioPhotoFrame";

describe("PortfolioPhotoFrame", () => {
  it("shows a neutral tile when the signed URL is missing", () => {
    render(<PortfolioPhotoFrame src={null} alt="Cedar panel" />);
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Cedar panel")).not.toBeInTheDocument();
  });

  it("replaces a failed image with the same tile", () => {
    render(<PortfolioPhotoFrame src="https://example.com/missing.jpg" alt="Cedar panel" />);
    const photo = screen.getByRole("img", { name: "Cedar panel" });
    fireEvent.error(photo);
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Cedar panel")).not.toBeInTheDocument();
  });
});
