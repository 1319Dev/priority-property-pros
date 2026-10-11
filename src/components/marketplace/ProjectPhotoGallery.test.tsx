import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProjectPhotoGallery } from "./ProjectPhotoGallery";

describe("ProjectPhotoGallery", () => {
  it("enlarges a photo and closes it", async () => {
    const user = userEvent.setup();
    render(<ProjectPhotoGallery photos={[{ id: "photo-1", url: "https://example.com/fence.jpg" }]} />);
    expect(screen.getByRole("img", { name: "Project photo" })).toHaveAttribute("alt", "Project photo");
    await user.click(screen.getByRole("button", { name: "Enlarge project photo" }));
    const dialog = screen.getByRole("dialog", { name: "Enlarged project photo" });
    expect(within(dialog).getByRole("img", { name: "Project photo" })).toHaveClass("w-full");
    await user.click(screen.getByRole("button", { name: "Close photo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("gives every thumbnail non-empty alt text", () => {
    render(
      <ProjectPhotoGallery
        photos={[
          { id: "a", url: "https://example.com/a.jpg" },
          { id: "b", url: "https://example.com/b.jpg" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Project photo 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Project photo 2 of 2" })).toBeInTheDocument();
    expect(document.querySelectorAll('img[alt=""]')).toHaveLength(0);
  });
});
