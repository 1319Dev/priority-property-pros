import { describe, expect, it } from "vitest";
import {
  BOOKING_REVIEW_EDIT_WINDOW_DAYS,
  formatReviewPostedDate,
  reviewEditWindowNote,
  reviewIsEditable,
} from "./reviewEdits";

const posted = "2026-10-01T15:00:00.000Z";
const day = 24 * 60 * 60 * 1000;

describe("booking review edit window", () => {
  it("uses one 30-day constant", () => {
    expect(BOOKING_REVIEW_EDIT_WINDOW_DAYS).toBe(30);
  });

  it("stays editable through the close instant and closes after it", () => {
    const created = new Date(posted).getTime();
    const closes = created + 30 * day;
    expect(reviewIsEditable(posted, closes)).toBe(true);
    expect(reviewIsEditable(posted, closes + 1)).toBe(false);
    expect(reviewIsEditable(posted, closes, -1)).toBe(true);
  });

  it("formats the posted date and the edited note", () => {
    expect(formatReviewPostedDate(posted)).toBe("Oct 1, 2026");
    expect(reviewEditWindowNote(true)).toMatch(/30 days/);
    expect(reviewEditWindowNote(false)).toMatch(/has closed/);
  });
});
