import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STAGING_PREVIEW_COPY, StagingPreviewBanner } from "./StagingPreviewBanner";

describe("StagingPreviewBanner", () => {
  it("renders the staging copy when enabled and stays at the top (not over bottom nav)", () => {
    const { container } = render(<StagingPreviewBanner enabled />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(STAGING_PREVIEW_COPY);
    expect(banner.className).toMatch(/pt-safe/);
    expect(banner.className).not.toMatch(/\bfixed\b/);
    expect(banner.className).not.toMatch(/bottom-0/);
    expect(container.firstChild).toBe(banner);
  });

  it("renders nothing when staging is off", () => {
    const { container } = render(<StagingPreviewBanner enabled={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(STAGING_PREVIEW_COPY)).not.toBeInTheDocument();
  });
});
