import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectCoverageNotice } from "./ProjectCoverageNotice";

const conroe = async () => ({ zip: "77301", city: "Conroe", state: "TX" });

describe("ProjectCoverageNotice", () => {
  it("names the ZIP city and keeps the project when nobody covers it", async () => {
    render(
      <ProjectCoverageNotice
        status="MATCHING"
        zip="77301"
        city="123 Main Street"
        state="TX"
        resolvePlace={conroe}
      />,
    );
    expect(await screen.findByText("Finding pros near Conroe, TX")).toBeInTheDocument();
    expect(screen.getByText(/No pros in your area yet/)).toBeInTheDocument();
    expect(screen.queryByText(/123 Main Street/)).not.toBeInTheDocument();
  });

  it("keeps the offer-queue message when pros are already being asked", async () => {
    render(<ProjectCoverageNotice status="CONTRACTORS_RESPONDING" zip="77301" resolvePlace={conroe} />);
    expect(await screen.findByText("Finding pros near Conroe, TX")).toBeInTheDocument();
    expect(screen.getByText(/up to 3 local pros/i)).toBeInTheDocument();
    expect(screen.queryByText(/No pros in your area yet/)).not.toBeInTheDocument();
  });

  it("does not render a coverage banner for a draft", () => {
    render(<ProjectCoverageNotice status="DRAFT" zip="77301" resolvePlace={conroe} />);
    expect(screen.queryByText(/Finding pros near/)).not.toBeInTheDocument();
  });
});
