import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProjectPhotoGallery } from "./ProjectPhotoGallery";

describe("ProjectPhotoGallery", () => {
  it("enlarges a photo and closes it", async () => {
    const user = userEvent.setup();
    render(<ProjectPhotoGallery photos={[{ id: "photo-1", url: "https://example.com/fence.jpg" }]} />);
    await user.click(screen.getByRole("button", { name: "Enlarge photo" }));
    expect(screen.getByRole("dialog", { name: "Enlarged project photo" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Project photo" })).toHaveClass("w-full");
    await user.click(screen.getByRole("button", { name: "Close photo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
