import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowFeesWork } from "./HowFeesWork";

describe("activation fee note", () => {
  it("hides the $9.99 banner for paid and exempt pros, including a narrow width", () => {
    const { rerender } = render(
      <div className="w-[390px] max-w-[390px]">
        <HowFeesWork signupFeeStatus="NOT_REQUIRED" />
      </div>,
    );
    expect(screen.queryByText(/\$9\.99/)).not.toBeInTheDocument();
    rerender(
      <div className="w-[390px] max-w-[390px]">
        <HowFeesWork signupFeeStatus="PAID" />
      </div>,
    );
    expect(screen.queryByText(/\$9\.99/)).not.toBeInTheDocument();
    rerender(
      <div className="w-[390px] max-w-[390px]">
        <HowFeesWork signupFeeStatus="UNPAID" />
      </div>,
    );
    expect(screen.getByText(/\$9\.99 activation/)).toBeInTheDocument();
  });
});
