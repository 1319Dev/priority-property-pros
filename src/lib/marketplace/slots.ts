import { MAX_PARTICIPATING_CONTRACTORS } from "./types";

/** Next free slot in 1..max, or null if the project is full. */
export function nextOpportunitySlot(
  taken: Iterable<number>,
  max = MAX_PARTICIPATING_CONTRACTORS,
): number | null {
  const used = new Set(taken);
  for (let slot = 1; slot <= max; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

/**
 * Models the DB unique (project_id, slot_number) race:
 * two concurrent claims of the last slot — first writer wins.
 */
export function claimSlotExclusive(
  taken: Set<number>,
  max = MAX_PARTICIPATING_CONTRACTORS,
): number | null {
  const slot = nextOpportunitySlot(taken, max);
  if (slot == null) return null;
  if (taken.has(slot)) return null;
  taken.add(slot);
  return slot;
}
