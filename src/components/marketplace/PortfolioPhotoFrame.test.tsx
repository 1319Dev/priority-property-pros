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

  it("shows a loading tile before a signed URL arrives", () => {
    render(<PortfolioPhotoFrame src={null} alt="Cedar panel" loading />);
    expect(screen.getByRole("status", { name: "Loading portfolio photo" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("uses a mobile-friendly frame for a signed photo", () => {
    render(<PortfolioPhotoFrame src="https://example.com/storage/v1/object/sign/contractor-docs/a.jpg?token=1" alt="Cedar panel" />);
    const photo = screen.getByRole("img", { name: "Cedar panel" });
    expect(photo).toHaveAttribute("sizes", "(max-width: 640px) 100vw, 50vw");
    expect(photo.className).toMatch(/object-cover/);
    expect(photo.parentElement?.className).toMatch(/max-h-56/);
    expect(photo.parentElement?.className).toMatch(/sm:max-h-72/);
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
