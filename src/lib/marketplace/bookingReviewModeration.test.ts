import { describe, expect, it } from "vitest";
import {
  RATING_ONLY_HIDE_NOTE,
  bookingReviewResponseError,
  moderationReasonIsRatingOnly,
  moderationReasonReady,
  reportReasonReady,
} from "./bookingReviewModeration";

describe("booking review moderation reasons", () => {
  it("treats a star complaint as rating-only and accepts evidence", () => {
    expect(moderationReasonIsRatingOnly("just a poor one star score")).toBe(true);
    expect(moderationReasonIsRatingOnly("too low of a bad rating only")).toBe(true);
    expect(moderationReasonReady("just a poor one star score")).toBe(false);
    expect(moderationReasonIsRatingOnly("The description names a gate that was not part of this job.")).toBe(false);
    expect(moderationReasonReady("The description names a gate that was not part of this job.")).toBe(true);
    expect(moderationReasonReady("too short")).toBe(false);
    expect(RATING_ONLY_HIDE_NOTE).toMatch(/cannot be hidden only because of its rating/);
  });

  it("limits a report reason and blocks contact in a public response", () => {
    expect(reportReasonReady("no")).toBe(false);
    expect(reportReasonReady("The gate was not on this job.")).toBe(true);
    expect(bookingReviewResponseError("Too short")).toMatch(/20 to 500/);
    expect(bookingReviewResponseError("Call me at 512-555-0199 and I will explain the gate.")).toMatch(/phone number/i);
    expect(bookingReviewResponseError("We finished the remaining gate hardware the next morning.")).toBeNull();
  });
});
