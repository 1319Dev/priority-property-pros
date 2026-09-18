import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StagingPreviewBanner } from "./StagingPreviewBanner";
import { STAGING_PREVIEW_BANNER_LABEL } from "../../lib/env/publicEnvironment";

describe("StagingPreviewBanner", () => {
  it("renders STAGING / PREVIEW when environment is staging", () => {
    render(<StagingPreviewBanner environment="staging" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-environment", "staging");
    expect(screen.getByText(STAGING_PREVIEW_BANNER_LABEL)).toBeInTheDocument();
    expect(screen.getByText(/not the production site/i)).toBeInTheDocument();
  });

  it("hides when environment is not staging", () => {
    const { container } = render(<StagingPreviewBanner environment="production" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(STAGING_PREVIEW_BANNER_LABEL)).not.toBeInTheDocument();
  });
});
