import type { AccountStatus, AccountType, ApprovalStatus } from "./types";

export type Actor = {
  id: string | null;
  accountType: AccountType | null;
  accountStatus: AccountStatus | null;
};

export function actorIsAdmin(actor: Actor): boolean {
  return actor.accountType === "ADMIN" && actor.accountStatus === "ACTIVE";
}

/** Mirrors profiles SELECT policy + protect_profile_columns for JWT sessions. */
export function canReadProfile(actor: Actor, rowId: string): boolean {
  if (!actor.id) return false;
  return actor.id === rowId || actorIsAdmin(actor);
}

export function canClientAssignAdmin(actor: Actor): boolean {
  // JWT present → never. SQL editor has actor.id null.
  return actor.id === null;
}

export function canChangeAccountType(
  actor: Actor,
  from: AccountType,
  to: AccountType,
): boolean {
  if (from === to) return true;
  if (to === "ADMIN") return canClientAssignAdmin(actor);
  if (!actor.id) return true;
  return actorIsAdmin(actor);
}

export function canChangeAccountStatus(actor: Actor, from: AccountStatus, to: AccountStatus): boolean {
  if (from === to) return true;
  if (!actor.id) return true;
  return actorIsAdmin(actor);
}

export function canReadOtherUsersRow(actor: Actor, otherId: string): boolean {
  return canReadProfile(actor, otherId);
}

export function canSelfApprove(actor: Actor, from: ApprovalStatus, to: ApprovalStatus): boolean {
  if (from === to) return true;
  if (!actor.id) return true;
  return actorIsAdmin(actor);
}

export function canMutateAuditLog(): boolean {
  return false;
}

export function canInsertOwnAcceptance(actor: Actor, profileId: string): boolean {
  return Boolean(actor.id) && actor.id === profileId;
}

export function canClientMarkSignupFeePaid(): boolean {
  return false;
}
