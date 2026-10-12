import { TIMING_PREFERENCES, type TimingPreference } from "./types";

const STORAGE_KEY = "ppp.postProjectWizard";

/** In-tab form state. No project id and no server row. */
export type WizardSession = {
  step: number;
  title: string;
  description: string;
  categoryId: string | null;
  answers: Record<string, string>;
  street: string;
  street2: string;
  city: string;
  state: string;
  zipCode: string;
  timing: TimingPreference | null;
  preferredDate: string;
  budgetMin: string;
  budgetMax: string;
};

export function emptyWizardSession(): WizardSession {
  return {
    step: 1,
    title: "",
    description: "",
    categoryId: null,
    answers: {},
    street: "",
    street2: "",
    city: "",
    state: "",
    zipCode: "",
    timing: null,
    preferredDate: "",
    budgetMin: "",
    budgetMax: "",
  };
}

export function wizardSessionIsEmpty(value: WizardSession): boolean {
  const empty = emptyWizardSession();
  return (
    value.step === empty.step &&
    value.title === "" &&
    value.description === "" &&
    value.categoryId == null &&
    Object.keys(value.answers).length === 0 &&
    value.street === "" &&
    value.street2 === "" &&
    value.city === "" &&
    value.state === "" &&
    value.zipCode === "" &&
    value.timing == null &&
    value.preferredDate === "" &&
    value.budgetMin === "" &&
    value.budgetMax === ""
  );
}

function isTiming(value: unknown): value is TimingPreference {
  return typeof value === "string" && (TIMING_PREFERENCES as readonly string[]).includes(value);
}

type StoredWizardDraft = {
  /** auth user id of the homeowner who typed the draft */
  ownerId: string;
  draft: Partial<WizardSession>;
};

function normalizeWizardSession(parsed: Partial<WizardSession> | null | undefined): WizardSession | null {
  if (!parsed || typeof parsed !== "object") return null;
  const empty = emptyWizardSession();
  const step = typeof parsed.step === "number" && parsed.step >= 1 && parsed.step <= 8 ? parsed.step : 1;
  const answers =
    parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers) ? parsed.answers : {};
  return {
    ...empty,
    step,
    title: typeof parsed.title === "string" ? parsed.title : "",
    description: typeof parsed.description === "string" ? parsed.description : "",
    categoryId: typeof parsed.categoryId === "string" ? parsed.categoryId : null,
    answers,
    street: typeof parsed.street === "string" ? parsed.street : "",
    street2: typeof parsed.street2 === "string" ? parsed.street2 : "",
    city: typeof parsed.city === "string" ? parsed.city : "",
    state: typeof parsed.state === "string" ? parsed.state : "",
    zipCode: typeof parsed.zipCode === "string" ? parsed.zipCode : "",
    timing: isTiming(parsed.timing) ? parsed.timing : null,
    preferredDate: typeof parsed.preferredDate === "string" ? parsed.preferredDate : "",
    budgetMin: typeof parsed.budgetMin === "string" ? parsed.budgetMin : "",
    budgetMax: typeof parsed.budgetMax === "string" ? parsed.budgetMax : "",
  };
}

function readStoredDraft(storage: Pick<Storage, "getItem">): StoredWizardDraft | "unowned" | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<StoredWizardDraft> | null;
  if (!parsed || typeof parsed !== "object") return "unowned";
  if (typeof parsed.ownerId !== "string" || !parsed.ownerId || !parsed.draft || typeof parsed.draft !== "object") {
    // Drafts saved before drafts were tied to an account have no owner. Never restore them.
    return "unowned";
  }
  return { ownerId: parsed.ownerId, draft: parsed.draft };
}

/**
 * Reads the wizard draft saved in this tab, but only when it belongs to the
 * signed-in homeowner. A draft typed by another account on the same browser
 * (or an old draft with no owner) is removed and never returned.
 */
export function readWizardSession(
  ownerId: string | null | undefined,
  storage: Pick<Storage, "getItem" | "removeItem"> = sessionStorage,
): WizardSession | null {
  if (!ownerId) return null;
  try {
    const stored = readStoredDraft(storage);
    if (!stored) return null;
    if (stored === "unowned" || stored.ownerId !== ownerId) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return normalizeWizardSession(stored.draft);
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** True when this tab holds a non-empty wizard draft for any account (used by the update guard). */
export function hasUnsavedWizardDraft(storage: Pick<Storage, "getItem"> = sessionStorage): boolean {
  try {
    const stored = readStoredDraft(storage);
    if (!stored || stored === "unowned") return false;
    const draft = normalizeWizardSession(stored.draft);
    return draft != null && !wizardSessionIsEmpty(draft);
  } catch {
    return false;
  }
}

export function writeWizardSession(
  value: WizardSession,
  ownerId: string | null | undefined,
  storage: Pick<Storage, "setItem"> = sessionStorage,
): void {
  if (!ownerId) return;
  const stored: StoredWizardDraft = { ownerId, draft: value };
  storage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/** Removes any wizard draft from this tab. Called after posting, on sign-out, and after account deletion. */
export function clearWizardSession(storage: Pick<Storage, "removeItem"> | null = null): void {
  try {
    (storage ?? sessionStorage).removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * After a reload the wizard keeps what was typed but starts again at step 1,
 * so the homeowner rereads the form instead of landing on Review.
 */
export function resumeAtFirstStep(value: WizardSession | null): WizardSession | null {
  return value ? { ...value, step: 1 } : null;
}

export type AddressOnFile = {
  projectId: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zipCode: string;
};

type ProjectPlace = {
  id: string;
  status?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  posted_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

/** The newest posted project with a ZIP code. Its place is the homeowner's address on file. */
export function latestProjectPlace<T extends ProjectPlace>(projects: readonly T[]): T | null {
  const stamp = (row: ProjectPlace) => Date.parse(row.posted_at ?? row.updated_at ?? row.created_at ?? "") || 0;
  return (
    [...projects]
      .filter((row) => row.status !== "DRAFT" && typeof row.zip_code === "string" && row.zip_code.trim() !== "")
      .sort((a, b) => stamp(b) - stamp(a))[0] ?? null
  );
}

export function wizardLocationIsEmpty(value: WizardSession): boolean {
  return !value.street.trim() && !value.street2.trim() && !value.city.trim() && !value.state.trim() && !value.zipCode.trim();
}

/** Fills the location step from the address on file. Never overwrites anything the homeowner typed. */
export function withAddressOnFile(value: WizardSession, address: AddressOnFile | null): WizardSession {
  if (!address || !wizardLocationIsEmpty(value)) return value;
  return {
    ...value,
    street: address.street,
    street2: address.street2,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
  };
}
