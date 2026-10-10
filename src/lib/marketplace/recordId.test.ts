import { describe, expect, it } from "vitest";
import { friendlyNotFound, isQueryableId, isUuid } from "./recordId";

describe("record ids", () => {
  it("accepts uuids and fixture ids, and rejects junk before a query", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("book-1")).toBe(false);
    expect(isQueryableId("book-1")).toBe(true);
    expect(isQueryableId("p1")).toBe(true);
    expect(isQueryableId("pro-1")).toBe(true);
    expect(isQueryableId("x")).toBe(false);
    expect(isQueryableId("y")).toBe(false);
    expect(isQueryableId("not a uuid")).toBe(false);
  });

  it("hides raw database errors", () => {
    expect(friendlyNotFound('invalid input syntax for type uuid: "x"')).toBe("We couldn't find that.");
    expect(friendlyNotFound("Booking not found.")).toBe("Booking not found.");
  });
});
