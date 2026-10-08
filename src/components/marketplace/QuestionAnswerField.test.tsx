import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionAnswerField } from "./QuestionAnswerField";

const base = {
  prompt: "Fence material",
  help_text: "Pick the closest match.",
  options: ["Wood", "Vinyl"],
  is_required: true,
};

describe("QuestionAnswerField", () => {
  it("uses a select for single choice and yes/no, and typed inputs for the rest", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <QuestionAnswerField question={{ ...base, kind: "SINGLE_CHOICE" }} value="" onChange={onChange} />,
    );
    expect(screen.getByRole("combobox", { name: "Fence material" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Fence material" }), "Wood");
    expect(onChange).toHaveBeenCalledWith("Wood");

    rerender(<QuestionAnswerField question={{ ...base, kind: "BOOLEAN", prompt: "HOA?" }} value="" onChange={onChange} />);
    expect(screen.getByRole("option", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No" })).toBeInTheDocument();

    rerender(
      <QuestionAnswerField question={{ ...base, kind: "MULTI_CHOICE", prompt: "Sides" }} value="Wood" onChange={onChange} />,
    );
    expect(screen.getByRole("checkbox", { name: "Wood" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Vinyl" }));
    expect(onChange).toHaveBeenCalledWith("Wood, Vinyl");

    rerender(<QuestionAnswerField question={{ ...base, kind: "NUMBER", prompt: "Length" }} value="12" onChange={onChange} />);
    expect(screen.getByRole("textbox", { name: "Length" })).toHaveAttribute("inputMode", "decimal");

    rerender(<QuestionAnswerField question={{ ...base, kind: "TEXT", prompt: "Notes" }} value="" onChange={onChange} />);
    expect(screen.getByRole("textbox", { name: "Notes" }).tagName).toBe("TEXTAREA");
  });
});
