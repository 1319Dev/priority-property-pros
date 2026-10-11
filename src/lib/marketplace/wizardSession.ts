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

export function readWizardSession(storage: Pick<Storage, "getItem"> = sessionStorage): WizardSession | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardSession>;
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
  } catch {
    return null;
  }
}

export function writeWizardSession(value: WizardSession, storage: Pick<Storage, "setItem"> = sessionStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearWizardSession(storage: Pick<Storage, "removeItem"> = sessionStorage): void {
  storage.removeItem(STORAGE_KEY);
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
