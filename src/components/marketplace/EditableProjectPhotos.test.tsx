import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditableProjectPhotos } from "./EditableProjectPhotos";

const photo = { id: "photo-1", storage_path: "a/b.jpg", url: "https://example.com/a.jpg" };

describe("EditableProjectPhotos", () => {
  it("shows uploading and removing states and blocks the other control", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onAdd = vi.fn();
    const { rerender } = render(<EditableProjectPhotos photos={[photo]} busy="upload" onRemove={onRemove} onAdd={onAdd} />);
    expect(screen.getByRole("status")).toHaveTextContent("Uploading…");
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(screen.getByLabelText("Add a photo")).toBeDisabled();

    rerender(<EditableProjectPhotos photos={[photo]} busy="photo-1" onRemove={onRemove} onAdd={onAdd} />);
    expect(screen.getByRole("button", { name: "Removing…" })).toBeDisabled();

    rerender(<EditableProjectPhotos photos={[photo]} busy={null} onRemove={onRemove} onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(photo);
  });
});
