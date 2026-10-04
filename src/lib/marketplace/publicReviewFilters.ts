/** Text that must never appear as a public review or contractor preview. */
export function isSmokeTesterText(value: string | null | undefined): boolean {
  return /\bsmoke\s*tester\b/i.test(value ?? "");
}

/**
 * Contractor profile created for smoke tests. Public previews must not
 * treat its reviews as customer proof, even if the card is anonymized.
 */
export const SMOKE_TESTER_CONTRACTOR_PROFILE_ID = "af55cdfe-b3aa-421d-84b3-0411d9d7e3b6";

export function isExcludedPublicContractorId(id: string | null | undefined): boolean {
  return id === SMOKE_TESTER_CONTRACTOR_PROFILE_ID;
}
