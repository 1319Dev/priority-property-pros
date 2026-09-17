import { describe, expect, it } from "vitest";
import {
  bookingIsProtected,
  canOwnerEditProject,
  classifyProjectPatch,
  hasParticipation,
  planDeleteOrCancel,
  planMaterialEdit,
  selectionCreatesRelationship,
} from "./lifecycle";

const participationNone = { acceptedOpportunityCount: 0, submittedEstimateCount: 0, opportunityCount: 0 };
const participationYes = { acceptedOpportunityCount: 1, submittedEstimateCount: 1, opportunityCount: 2 };

describe("owner edit authorization", () => {
  it("is owner-only and never available to a contractor or stranger", () => {
    expect(
      canOwnerEditProject({
        isOwner: true,
        actorIsContractor: false,
        isAdmin: false,
        projectStatus: "POSTED",
        bookingStatus: null,
      }),
    ).toBe(true);
    expect(
      canOwnerEditProject({
        isOwner: false,
        actorIsContractor: true,
        isAdmin: false,
        projectStatus: "POSTED",
        bookingStatus: null,
      }),
    ).toBe(false);
    expect(
      canOwnerEditProject({
        isOwner: false,
        actorIsContractor: false,
        isAdmin: false,
        projectStatus: "POSTED",
        bookingStatus: null,
      }),
    ).toBe(false);
  });
});

describe("material vs minor edits", () => {
  it("treats title, timing, and budget as minor", () => {
    expect(classifyProjectPatch({ title: "New title" })).toBe("minor");
    expect(classifyProjectPatch({ timing: "ASAP", budget_min_cents: 1000 })).toBe("minor");
  });

  it("treats description, category, answers, photos, and location as material", () => {
    expect(classifyProjectPatch({ description: "bigger job" })).toBe("material");
    expect(classifyProjectPatch({ category_id: "cat-2" })).toBe("material");
    expect(classifyProjectPatch({ zip_code: "37206" })).toBe("material");
    expect(classifyProjectPatch({ answers: [] })).toBe("material");
    expect(classifyProjectPatch({ photos: [] })).toBe("material");
  });

  it("applies material edits when nobody has priced the job", () => {
    expect(
      planMaterialEdit({
        isOwner: true,
        isAdmin: false,
        projectStatus: "POSTED",
        bookingStatus: null,
        participation: participationNone,
        changingCategory: false,
      }),
    ).toEqual({ ok: true, effect: "apply" });
  });

  it("does not silently keep old estimates after a material scope change", () => {
    const plan = planMaterialEdit({
      isOwner: true,
      isAdmin: false,
      projectStatus: "ESTIMATES_AVAILABLE",
      bookingStatus: null,
      participation: participationYes,
      changingCategory: false,
    });
    expect(plan.ok).toBe(true);
    expect(plan).toMatchObject({ effect: "invalidate_estimates" });
    if (plan.ok && plan.effect === "invalidate_estimates") {
      expect(plan.message).toMatch(/out of date/i);
    }
  });

  it("blocks category changes after contractors have participated", () => {
    const plan = planMaterialEdit({
      isOwner: true,
      isAdmin: false,
      projectStatus: "CONTRACTORS_RESPONDING",
      bookingStatus: null,
      participation: participationYes,
      changingCategory: true,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.code).toBe("blocked_category");
  });

  it("never mutates scope under a selected or confirmed estimate", () => {
    expect(
      planMaterialEdit({
        isOwner: true,
        isAdmin: false,
        projectStatus: "CONTRACTOR_SELECTED",
        bookingStatus: "PENDING",
        participation: participationYes,
        changingCategory: false,
      }).ok,
    ).toBe(false);
    expect(
      planMaterialEdit({
        isOwner: true,
        isAdmin: false,
        projectStatus: "CONTRACTOR_SELECTED",
        bookingStatus: "CONFIRMED",
        participation: participationYes,
        changingCategory: false,
      }).ok,
    ).toBe(false);
    expect(bookingIsProtected("CONFIRMED")).toBe(true);
    expect(bookingIsProtected("PENDING")).toBe(false);
  });
});

describe("delete vs cancel lifecycle", () => {
  it("permanently deletes a draft with no activity", () => {
    const plan = planDeleteOrCancel({
      isOwner: true,
      isAdmin: false,
      projectStatus: "DRAFT",
      bookingStatus: null,
      participation: participationNone,
    });
    expect(plan.action).toBe("delete");
  });

  it("cancels posted work after participation and preserves history", () => {
    const plan = planDeleteOrCancel({
      isOwner: true,
      isAdmin: false,
      projectStatus: "ESTIMATES_AVAILABLE",
      bookingStatus: null,
      participation: participationYes,
    });
    expect(plan.action).toBe("cancel");
    expect(plan.message).toMatch(/cancelled/i);
  });

  it("allows safe cancel after selection with no confirmed booking", () => {
    const plan = planDeleteOrCancel({
      isOwner: true,
      isAdmin: false,
      projectStatus: "CONTRACTOR_SELECTED",
      bookingStatus: "PENDING",
      participation: participationYes,
    });
    expect(plan.action).toBe("cancel");
    expect(selectionCreatesRelationship()).toBe(false);
  });

  it("blocks destructive deletion after confirmed / in-progress / completed / disputed bookings", () => {
    for (const status of ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "DISPUTED"] as const) {
      expect(
        planDeleteOrCancel({
          isOwner: true,
          isAdmin: false,
          projectStatus: "CONTRACTOR_SELECTED",
          bookingStatus: status,
          participation: participationYes,
        }).action,
      ).toBe("block");
    }
  });

  it("does not let a contractor or stranger delete", () => {
    expect(
      planDeleteOrCancel({
        isOwner: false,
        isAdmin: false,
        projectStatus: "DRAFT",
        bookingStatus: null,
        participation: participationNone,
      }).action,
    ).toBe("block");
  });

  it("treats matching activity as participation for invalidation, not for stranger edits", () => {
    expect(hasParticipation({ acceptedOpportunityCount: 0, submittedEstimateCount: 1, opportunityCount: 3 })).toBe(true);
    expect(hasParticipation(participationNone)).toBe(false);
  });
});
