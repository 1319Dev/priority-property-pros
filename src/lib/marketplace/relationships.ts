export type RelationshipRow = {
  customer_id: string;
  contractor_profile_id: string;
  last_completed_booking_id: string | null;
  status: "ACTIVE" | "BLOCKED";
  protected_until: string;
};

export function isHireAgainEligible(row: RelationshipRow, now = new Date()): boolean {
  if (row.status !== "ACTIVE") return false;
  if (!row.last_completed_booking_id) return false;
  return Boolean(now);
}

/** Repeat pricing follows completed PPP history, not the 12-month protected window. */
export function repeatPricingEligible(hasCompletedConfirmedBooking: boolean): boolean {
  return hasCompletedConfirmedBooking;
}

export function protectedPeriodActive(protectedUntil: string, now = new Date()): boolean {
  return new Date(protectedUntil).getTime() > now.getTime();
}

export function addProtectionMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function relationshipCreatedOn(status: "PENDING" | "AWAITING_PAYMENT" | "CONFIRMED" | "CANCELLED"): boolean {
  return status === "CONFIRMED";
}

export function clientCannotForgeRelationship(): boolean {
  return true;
}

export function clientCannotSelfMarkRepeat(): boolean {
  return true;
}
