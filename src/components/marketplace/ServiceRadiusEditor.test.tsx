import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ServiceRadiusEditor } from "./ServiceRadiusEditor";

function Editor() {
  const [centerZip, setCenterZip] = useState("");
  const [radiusMiles, setRadiusMiles] = useState("");
  const [extraZips, setExtraZips] = useState("");
  return (
    <ServiceRadiusEditor
      centerZip={centerZip}
      radiusMiles={radiusMiles}
      extraZips={extraZips}
      onCenterZipChange={setCenterZip}
      onRadiusMilesChange={setRadiusMiles}
      onExtraZipsChange={setExtraZips}
      loadPreview={async (zip) => {
        if (zip !== "77301") return { ok: false, error: "Enter a valid US ZIP code." };
        return { ok: true, preview: "Covers about 42 ZIP codes around Conroe, TX" };
      }}
    />
  );
}

describe("ServiceRadiusEditor", () => {
  it("validates the base ZIP and shows the radius preview", async () => {
    const user = userEvent.setup();
    render(<Editor />);

    const baseZip = screen.getByRole("textbox", { name: /base zip/i });
    await user.type(baseZip, "7730");
    await user.tab();
    expect(screen.getByText("Enter a 5-digit base ZIP code.")).toBeInTheDocument();

    await user.clear(baseZip);
    await user.type(baseZip, "99999");
    await user.click(screen.getByRole("button", { name: "25 miles" }));
    expect(await screen.findByText("Enter a valid US ZIP code.")).toBeInTheDocument();

    await user.clear(baseZip);
    await user.type(baseZip, "77301");
    expect(await screen.findByText("Covers about 42 ZIP codes around Conroe, TX")).toBeInTheDocument();

    await user.click(screen.getByText("Also include specific ZIP codes"));
    await user.type(screen.getByRole("textbox", { name: /extra zips/i }), "12");
    await user.tab();
    expect(screen.getByText("Unknown ZIP code 12.")).toBeInTheDocument();
  });
});
