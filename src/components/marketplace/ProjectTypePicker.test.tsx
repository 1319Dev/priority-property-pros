import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SERVICES } from "../../data/services";
import { ProjectTypePicker } from "./ProjectTypePicker";

const categories = SERVICES.map((service) => ({
  id: `id-${service.id}`,
  slug: service.id,
  name: service.name,
  blurb: service.blurb,
}));

function StatefulPicker({
  initialId = null,
  onSelect = vi.fn(),
}: {
  initialId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  return (
    <ProjectTypePicker
      categories={categories}
      selectedId={selectedId}
      onSelect={(id) => {
        onSelect(id);
        setSelectedId(id);
      }}
    />
  );
}

describe("ProjectTypePicker", () => {
  it("shows Interior types by default and hides other groups", () => {
    render(<StatefulPicker />);
    expect(screen.getByRole("tab", { name: "Interior" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("radio", { name: /tv mounting/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /fence repair/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /lawn care/i })).not.toBeInTheDocument();
  });

  it("switches tabs and still saves the selected category id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<StatefulPicker onSelect={onSelect} />);

    await user.click(screen.getByRole("tab", { name: "Exterior" }));
    expect(screen.getByRole("tab", { name: "Exterior" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("radio", { name: /fence repair/i }));

    expect(onSelect).toHaveBeenCalledWith("id-fence-repair");
    expect(screen.getByText(/selected:/i)).toHaveTextContent("Fence Repair");
    expect(screen.getByRole("radio", { name: /fence repair/i })).toBeChecked();
  });

  it("opens the tab that owns a preselected category so deep-link presets stay visible", () => {
    render(<StatefulPicker initialId="id-moving-help" />);
    expect(screen.getByRole("tab", { name: "Moving & cleanup" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("radio", { name: /moving help/i })).toBeChecked();
    expect(screen.getByText(/selected:/i)).toHaveTextContent("Moving Help");
  });

  it("places ungrouped catalog rows in Other", async () => {
    const user = userEvent.setup();
    render(
      <ProjectTypePicker
        categories={[...categories, { id: "id-new", slug: "brand-new-local-job", name: "Brand New Job", blurb: "Future catalog row" }]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Other" }));
    expect(screen.getByRole("radio", { name: /general property maintenance/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /brand new job/i })).toBeInTheDocument();
  });

  it("keeps the current selection visible after browsing another tab", async () => {
    const user = userEvent.setup();
    render(<StatefulPicker initialId="id-fence-repair" />);
    await user.click(screen.getByRole("tab", { name: "Interior" }));
    expect(screen.getByText(/selected:/i)).toHaveTextContent("Fence Repair");
    expect(screen.getByRole("radio", { name: /tv mounting/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /fence repair/i })).not.toBeInTheDocument();
  });
});
