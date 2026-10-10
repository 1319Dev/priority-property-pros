import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PORTFOLIO_REVIEW_NOTE } from "../../lib/marketplace/portfolioPrivacy";
import { PortfolioPhotoEditor } from "./PortfolioPhotoEditor";

const rows = [
  { id: "a", title: "Cedar panel", privacy_state: "REVIEW_REQUIRED" as const, imageUrl: null },
  { id: "b", title: "Front gate", privacy_state: "PUBLIC_SAFE" as const, imageUrl: "https://example.com/gate.jpg" },
  { id: "c", title: "Back fence", privacy_state: "PRIVATE" as const, imageUrl: null },
];

describe("Portfolio photo editor", () => {
  it("shows review status and does not render a broken image", () => {
    render(
      <PortfolioPhotoEditor rows={rows} editing={false} onAddFile={() => undefined} onRemove={() => undefined} onSaveCaption={() => undefined} />,
    );
    expect(screen.getByText(PORTFOLIO_REVIEW_NOTE)).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Front gate" })).toHaveAttribute("src", "https://example.com/gate.jpg");
    expect(screen.queryByLabelText("Add portfolio photo")).not.toBeInTheDocument();
  });

  it("saves a caption without a privacy field and accepts a new file", async () => {
    const user = userEvent.setup();
    const onSaveCaption = vi.fn();
    const onAddFile = vi.fn();
    const onRemove = vi.fn();
    render(
      <PortfolioPhotoEditor
        rows={[rows[0]]}
        editing
        onAddFile={onAddFile}
        onRemove={onRemove}
        onSaveCaption={onSaveCaption}
      />,
    );
    await user.clear(screen.getByRole("textbox", { name: /caption/i }));
    await user.type(screen.getByRole("textbox", { name: /caption/i }), "Fresh cedar caption");
    await user.click(screen.getByRole("button", { name: /save caption/i }));
    expect(onSaveCaption).toHaveBeenCalledTimes(1);
    expect(onSaveCaption).toHaveBeenCalledWith("a", "Fresh cedar caption");
    expect(onSaveCaption.mock.calls[0]).toHaveLength(2);

    const file = new File(["bytes"], "yard.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Add portfolio photo"), file);
    expect(onAddFile).toHaveBeenCalledWith(file);

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith("a");
  });
});
