import { describe, expect, it } from "vitest";
import {
  bookingIsProtected,
  buildCustomerEditPatch,
  canCancelCustomerProject,
  canOwnerEditProject,
  classifyProjectPatch,
  hasParticipation,
  planDeleteOrCancel,
  planMaterialEdit,
  selectionCreatesRelationship,
  type CustomerEditSnapshot,
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

  it("omits unchanged answers, city, and state so a timing edit stays minor", () => {
    const saved: CustomerEditSnapshot = {
      title: "Fence",
      description: "Replace the gate",
      category_id: "cat-1",
      city: "Nashville",
      state: "TN",
      zip_code: "37206",
      timing: "FLEXIBLE",
      preferred_date: null,
      budget_min_cents: 10000,
      budget_max_cents: 20000,
      street_line1: "1 Main",
      street_line2: "",
      answers: { q1: "Wood" },
    };
    const patch = buildCustomerEditPatch(saved, {
      ...saved,
      city: " Nashville ",
      state: "tennessee",
      timing: "ASAP",
      answers: { q1: "Wood" },
    });
    expect(patch.answers).toBeUndefined();
    expect(patch.city).toBeUndefined();
    expect(patch.state).toBeUndefined();
    expect(patch.timing).toBe("ASAP");
    expect(classifyProjectPatch(patch)).toBe("minor");
  });

  it("includes an answer only after the text changes", () => {
    const saved: CustomerEditSnapshot = {
      title: "Fence",
      description: "Replace the gate",
      category_id: "cat-1",
      city: "Nashville",
      state: "TN",
      zip_code: "37206",
      timing: "FLEXIBLE",
      preferred_date: null,
      budget_min_cents: null,
      budget_max_cents: null,
      street_line1: "",
      street_line2: "",
      answers: { q1: "Wood" },
    };
    const patch = buildCustomerEditPatch(saved, { ...saved, answers: { q1: "Vinyl" } });
    expect(patch.answers).toEqual([{ question_id: "q1", answer_text: "Vinyl" }]);
    expect(classifyProjectPatch(patch)).toBe("material");
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

  it("hides cancel once the job is mutually hired or already underway", () => {
    expect(
      canCancelCustomerProject({
        projectStatus: "ESTIMATES_AVAILABLE",
        bookingStatus: null,
      }),
    ).toBe(true);
    expect(
      canCancelCustomerProject({
        projectStatus: "CANCELLED",
        bookingStatus: null,
      }),
    ).toBe(false);
    for (const status of ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "DISPUTED"] as const) {
      expect(
        canCancelCustomerProject({
          projectStatus: "CONTRACTOR_SELECTED",
          bookingStatus: status,
        }),
      ).toBe(false);
    }
    expect(
      canCancelCustomerProject({
        projectStatus: "CONTRACTOR_SELECTED",
        bookingStatus: "PENDING",
        customerHiredAt: "2026-10-01T00:00:00Z",
        contractorHiredAt: "2026-10-02T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("treats matching activity as participation for invalidation, not for stranger edits", () => {
    expect(hasParticipation({ acceptedOpportunityCount: 0, submittedEstimateCount: 1, opportunityCount: 3 })).toBe(true);
    expect(hasParticipation(participationNone)).toBe(false);
  });
});
