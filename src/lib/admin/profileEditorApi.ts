import { runSensitiveAdminCall } from "../auth/adminStepUp";
import { detectContactLeak, CONTACT_AFTER_CONNECTION_COPY } from "../marketplace/contactLeak";
import { getSupabaseClient } from "../supabase/client";
import { asRecord, asRecords, readBool, readText } from "./json";

/**
 * Admin profile editor. Every call goes to an admin-only SECURITY DEFINER RPC
 * that checks is_admin() on the server and writes one audit_logs row per save.
 * Payment records, fee status, amounts, and Stripe ids are never part of a patch.
 */

export const ACCOUNT_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED", "DISABLED", "DELETED"] as const;
export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;
export const TIMINGS = ["ASAP", "WITHIN_A_WEEK", "WITHIN_A_MONTH", "SPECIFIC_DATE", "FLEXIBLE"] as const;
export const CREDENTIAL_KINDS = ["LICENSE", "INSURANCE", "OTHER"] as const;
export const CREDENTIAL_STATUSES = ["NOT_SUBMITTED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"] as const;
export const PHOTO_STATES = ["REVIEW_REQUIRED", "PUBLIC_SAFE", "PRIVATE"] as const;
export const AREA_MODES = ["ZIPS", "RADIUS", "ZIPS_AND_RADIUS"] as const;
export const NOTIFICATION_CATEGORIES = [
  "new_job",
  "messages",
  "connect",
  "estimates",
  "booking",
  "change_orders",
  "reviews",
  "account",
] as const;

/** Keys the server treats as sensitive. With PR #110 on, these need a fresh authenticator code. */
export const SENSITIVE_KEYS = ["email", "phone", "account_status", "approval_status", "directory_hidden"] as const;

/** Keys the server refuses outright. Kept here so the client never sends them. */
const MONEY_KEY = /^(stripe_|signup_fee_|amount_cents$|fee_cents$|contractor_fee_bps$|needs_refund$|refund_reason$|refunded_cents$)/;

export type Category = { id: string; name: string };

export type NotificationPref = { category: string; inApp: boolean; push: boolean; email: boolean };

export type CustomerLocation = {
  streetLine1: string;
  streetLine2: string;
  city: string;
  state: string;
  zipCode: string;
};

export type ProjectEdit = {
  projectId: string;
  referenceNumber: number | null;
  status: string;
  title: string;
  description: string;
  categoryId: string;
  city: string;
  state: string;
  zipCode: string;
  streetLine1: string;
  streetLine2: string;
  timing: string;
  preferredDate: string;
};

export type CustomerEditor = {
  profileId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  accountStatus: string;
  location: CustomerLocation;
  notifications: NotificationPref[];
  projects: ProjectEdit[];
  categories: Category[];
};

export type ServiceArea = {
  id: string | null;
  mode: string;
  label: string;
  centerZip: string;
  radiusMiles: string;
  zipCodes: string;
};

export type CredentialEdit = { id: string; kind: string; label: string; status: string; expiresAt: string };

export type PortfolioEdit = { id: string; title: string; description: string; privacyState: string };

export type ContractorEditor = {
  contractorProfileId: string;
  profileId: string;
  businessName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  bio: string;
  headline: string;
  primaryTrade: string;
  licenseNumber: string;
  insuranceCarrier: string;
  approvalStatus: string;
  accountStatus: string;
  directoryHidden: boolean;
  directoryListed: boolean;
  serviceCategoryIds: string[];
  serviceAreas: ServiceArea[];
  credentials: CredentialEdit[];
  portfolio: PortfolioEdit[];
  categories: Category[];
};

export type Patch = Record<string, unknown>;

const str = (value: unknown): string => readText(value) ?? (typeof value === "number" ? String(value) : "");

function categoriesFrom(value: unknown): Category[] {
  return asRecords(value).flatMap((row) => {
    const id = readText(row.id);
    return id ? [{ id, name: str(row.name) || id }] : [];
  });
}

export function parseCustomerEditor(raw: unknown): CustomerEditor {
  const row = asRecord(raw);
  if (!row || !readText(row.profile_id)) throw new Error("That homeowner could not be loaded.");
  const location = asRecord(row.location) ?? {};
  return {
    profileId: str(row.profile_id),
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    email: str(row.email),
    phone: str(row.phone),
    avatarUrl: str(row.avatar_url),
    accountStatus: str(row.account_status),
    location: {
      streetLine1: str(location.street_line1),
      streetLine2: str(location.street_line2),
      city: str(location.city),
      state: str(location.state),
      zipCode: str(location.zip_code),
    },
    notifications: asRecords(row.notifications).map((item) => ({
      category: str(item.category),
      inApp: readBool(item.in_app),
      push: readBool(item.push),
      email: readBool(item.email),
    })),
    projects: asRecords(row.projects).map((item) => ({
      projectId: str(item.project_id),
      referenceNumber: typeof item.reference_number === "number" ? item.reference_number : Number(item.reference_number) || null,
      status: str(item.status),
      title: str(item.title),
      description: str(item.description),
      categoryId: str(item.category_id),
      city: str(item.city),
      state: str(item.state),
      zipCode: str(item.zip_code),
      streetLine1: str(item.street_line1),
      streetLine2: str(item.street_line2),
      timing: str(item.timing),
      preferredDate: str(item.preferred_date),
    })),
    categories: categoriesFrom(row.categories),
  };
}

export function parseContractorEditor(raw: unknown): ContractorEditor {
  const row = asRecord(raw);
  if (!row || !readText(row.contractor_profile_id)) throw new Error("That contractor could not be loaded.");
  return {
    contractorProfileId: str(row.contractor_profile_id),
    profileId: str(row.profile_id),
    businessName: str(row.business_name),
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    email: str(row.email),
    phone: str(row.phone),
    avatarUrl: str(row.avatar_url),
    bio: str(row.bio),
    headline: str(row.headline),
    primaryTrade: str(row.primary_trade),
    licenseNumber: str(row.license_number),
    insuranceCarrier: str(row.insurance_carrier),
    approvalStatus: str(row.approval_status),
    accountStatus: str(row.account_status),
    directoryHidden: readBool(row.directory_hidden),
    directoryListed: readBool(row.directory_listed),
    serviceCategoryIds: asRecords(row.services).flatMap((item) => (readText(item.category_id) ? [str(item.category_id)] : [])),
    serviceAreas: asRecords(row.service_areas).map((item) => ({
      id: readText(item.id),
      mode: str(item.mode) || "ZIPS",
      label: str(item.label),
      centerZip: str(item.center_zip),
      radiusMiles: str(item.radius_miles),
      zipCodes: Array.isArray(item.zip_codes) ? item.zip_codes.filter((zip) => typeof zip === "string").join(", ") : "",
    })),
    credentials: asRecords(row.credentials).map((item) => ({
      id: str(item.id),
      kind: str(item.kind) || "OTHER",
      label: str(item.label),
      status: str(item.status),
      expiresAt: str(item.expires_at),
    })),
    portfolio: asRecords(row.portfolio).map((item) => ({
      id: str(item.id),
      title: str(item.title),
      description: str(item.description),
      privacyState: str(item.privacy_state),
    })),
    categories: categoriesFrom(row.categories),
  };
}

// ---------- validation that mirrors the server and the user-facing forms ----------

export function normalizePhone(value: string): string | null {
  if (!value.trim()) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{9}$/.test(digits)) throw new Error("Enter a 10-digit phone number.");
  return digits;
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

export function requireZip(value: string): string | null {
  const zip = value.trim();
  if (!zip) return null;
  const five = zip.replace(/-\d{4}$/, "");
  if (!/^\d{5}$/.test(five)) throw new Error("Enter a 5-digit ZIP code.");
  return five;
}

export function validateReason(reason: string): string {
  const value = reason.trim();
  if (value.length < 3 || value.length > 500) throw new Error("Enter a reason for this change (3 to 500 characters).");
  return value;
}

function publicText(label: string, value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  if (detectContactLeak(trimmed).blocked) throw new Error(CONTACT_AFTER_CONNECTION_COPY);
  return trimmed;
}

function avatar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 500 || /javascript:/i.test(trimmed) || /^data:/i.test(trimmed)) throw new Error("Enter an https avatar address.");
  if (trimmed.includes("://") && !/^https:\/\//i.test(trimmed)) throw new Error("Enter an https avatar address.");
  return trimmed;
}

const nullable = (value: string): string | null => (value.trim() ? value.trim() : null);

function assertNoMoneyKeys(patch: unknown): void {
  if (Array.isArray(patch)) {
    patch.forEach(assertNoMoneyKeys);
    return;
  }
  const record = asRecord(patch);
  if (!record) return;
  for (const [key, value] of Object.entries(record)) {
    if (MONEY_KEY.test(key)) throw new Error("payment records and fee status are not editable here");
    assertNoMoneyKeys(value);
  }
}

// ---------- patches: only changed keys go to the server ----------

function setIf(patch: Patch, key: string, before: unknown, after: unknown): void {
  if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) patch[key] = after;
}

function personPatch(
  patch: Patch,
  original: { firstName: string; lastName: string; email: string; phone: string; avatarUrl: string; accountStatus: string },
  draft: { firstName: string; lastName: string; email: string; phone: string; avatarUrl: string; accountStatus: string },
): void {
  const first = publicText("first name", draft.firstName, 80);
  if (!first) throw new Error("Enter a first name.");
  const last = publicText("last name", draft.lastName, 80);
  if (!last) throw new Error("Enter a last name.");
  setIf(patch, "first_name", original.firstName.trim(), first);
  setIf(patch, "last_name", original.lastName.trim(), last);
  const email = normalizeEmail(draft.email);
  if (email !== original.email.trim().toLowerCase()) patch.email = email;
  const phone = normalizePhone(draft.phone);
  if (phone !== (original.phone.trim() || null)) patch.phone = phone;
  setIf(patch, "avatar_url", original.avatarUrl.trim() || null, avatar(draft.avatarUrl) || null);
  if (!ACCOUNT_STATUSES.includes(draft.accountStatus as (typeof ACCOUNT_STATUSES)[number])) throw new Error("That account status is not valid.");
  setIf(patch, "account_status", original.accountStatus, draft.accountStatus);
}

export function buildCustomerPatch(original: CustomerEditor, draft: CustomerEditor): Patch {
  const patch: Patch = {};
  personPatch(patch, original, draft);

  const location = {
    street_line1: nullable(draft.location.streetLine1),
    street_line2: nullable(draft.location.streetLine2),
    city: nullable(draft.location.city),
    state: nullable(draft.location.state),
    zip_code: requireZip(draft.location.zipCode),
  };
  const before = {
    street_line1: nullable(original.location.streetLine1),
    street_line2: nullable(original.location.streetLine2),
    city: nullable(original.location.city),
    state: nullable(original.location.state),
    zip_code: nullable(original.location.zipCode),
  };
  setIf(patch, "location", before, location);

  const notifications = draft.notifications.filter((pref) => {
    const old = original.notifications.find((item) => item.category === pref.category);
    return !old || old.inApp !== pref.inApp || old.push !== pref.push || old.email !== pref.email;
  });
  if (notifications.length) {
    patch.notifications = notifications.map((pref) => ({ category: pref.category, in_app: pref.inApp, push: pref.push, email: pref.email }));
  }

  const projects: Patch[] = [];
  for (const project of draft.projects) {
    const old = original.projects.find((item) => item.projectId === project.projectId);
    if (!old) continue;
    const item: Patch = {};
    const title = publicText("project title", project.title, 120);
    if (!title) throw new Error("Enter a project title.");
    setIf(item, "title", old.title.trim(), title);
    setIf(item, "description", old.description.trim(), publicText("project description", project.description, 4000));
    setIf(item, "category_id", old.categoryId || null, project.categoryId || null);
    setIf(item, "city", nullable(old.city), nullable(project.city));
    setIf(item, "state", nullable(old.state), nullable(project.state));
    setIf(item, "zip_code", nullable(old.zipCode), requireZip(project.zipCode));
    setIf(item, "street_line1", nullable(old.streetLine1), nullable(project.streetLine1));
    setIf(item, "street_line2", nullable(old.streetLine2), nullable(project.streetLine2));
    setIf(item, "timing", old.timing || null, project.timing || null);
    if (project.timing === "SPECIFIC_DATE" && !project.preferredDate) throw new Error("Enter a preferred date for a specific-date timeline.");
    setIf(item, "preferred_date", old.preferredDate || null, project.preferredDate || null);
    if (Object.keys(item).length) projects.push({ project_id: project.projectId, ...item });
  }
  if (projects.length) patch.projects = projects;

  assertNoMoneyKeys(patch);
  return patch;
}

function zipList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((zip) => zip.trim())
    .filter(Boolean)
    .map((zip) => {
      const normalized = requireZip(zip);
      if (!normalized) throw new Error("Enter a 5-digit ZIP code.");
      return normalized;
    });
}

function areaPayload(area: ServiceArea): Patch {
  if (!AREA_MODES.includes(area.mode as (typeof AREA_MODES)[number])) throw new Error("That service area mode is not valid.");
  const radius = area.radiusMiles.trim() ? Number(area.radiusMiles) : null;
  const usesRadius = area.mode !== "ZIPS";
  if (usesRadius && (radius == null || !Number.isFinite(radius) || radius <= 0 || radius > 200)) {
    throw new Error("Enter a radius between 1 and 200 miles.");
  }
  const center = requireZip(area.centerZip);
  if (usesRadius && !center) throw new Error("Enter a 5-digit ZIP code.");
  const zips = zipList(area.zipCodes);
  if (zips.length > 40) throw new Error("Enter 40 ZIP codes or fewer.");
  if (area.mode !== "RADIUS" && zips.length === 0) throw new Error("Enter a 5-digit ZIP code.");
  return {
    ...(area.id ? { id: area.id } : {}),
    mode: area.mode,
    label: publicText("service area", area.label, 120) || null,
    center_zip: center,
    radius_miles: usesRadius ? radius : null,
    zip_codes: zips,
  };
}

export function buildContractorPatch(original: ContractorEditor, draft: ContractorEditor): Patch {
  const patch: Patch = {};
  personPatch(patch, original, draft);
  setIf(patch, "business_name", original.businessName.trim(), publicText("business name", draft.businessName, 80));
  setIf(patch, "headline", nullable(original.headline), nullable(publicText("headline", draft.headline, 120)));
  setIf(patch, "bio", nullable(original.bio), nullable(publicText("bio", draft.bio, 2000)));
  setIf(patch, "primary_trade", nullable(original.primaryTrade), nullable(publicText("primary trade", draft.primaryTrade, 80)));
  if (draft.licenseNumber.trim().length > 80) throw new Error("license number must be 80 characters or fewer");
  setIf(patch, "license_number", nullable(original.licenseNumber), nullable(draft.licenseNumber));
  setIf(patch, "insurance_carrier", nullable(original.insuranceCarrier), nullable(publicText("insurance carrier", draft.insuranceCarrier, 120)));
  if (!APPROVAL_STATUSES.includes(draft.approvalStatus as (typeof APPROVAL_STATUSES)[number])) throw new Error("That approval status is not valid.");
  setIf(patch, "approval_status", original.approvalStatus, draft.approvalStatus);
  setIf(patch, "directory_hidden", original.directoryHidden, draft.directoryHidden);

  const beforeServices = [...original.serviceCategoryIds].sort();
  const afterServices = [...new Set(draft.serviceCategoryIds)].sort();
  if (JSON.stringify(beforeServices) !== JSON.stringify(afterServices)) patch.service_category_ids = afterServices;

  const beforeAreas = JSON.stringify(original.serviceAreas);
  const afterAreas = JSON.stringify(draft.serviceAreas);
  if (beforeAreas !== afterAreas) patch.service_areas = draft.serviceAreas.map(areaPayload);

  const credentials: Patch[] = [];
  for (const credential of draft.credentials) {
    const old = original.credentials.find((item) => item.id === credential.id);
    if (!old) continue;
    const item: Patch = {};
    const label = publicText("credential label", credential.label, 120);
    if (!label) throw new Error("Enter a credential label.");
    setIf(item, "kind", old.kind, credential.kind);
    setIf(item, "label", old.label.trim(), label);
    setIf(item, "status", old.status, credential.status);
    setIf(item, "expires_at", old.expiresAt || null, credential.expiresAt || null);
    if (Object.keys(item).length) credentials.push({ id: credential.id, ...item });
  }
  if (credentials.length) patch.credentials = credentials;

  const portfolio: Patch[] = [];
  for (const photo of draft.portfolio) {
    const old = original.portfolio.find((item) => item.id === photo.id);
    if (!old) continue;
    const item: Patch = {};
    setIf(item, "title", old.title.trim(), publicText("portfolio caption", photo.title, 120));
    setIf(item, "description", nullable(old.description), nullable(publicText("portfolio description", photo.description, 2000)));
    setIf(item, "privacy_state", old.privacyState, photo.privacyState);
    if (Object.keys(item).length) portfolio.push({ id: photo.id, ...item });
  }
  if (portfolio.length) patch.portfolio = portfolio;

  assertNoMoneyKeys(patch);
  return patch;
}

export function patchNeedsStepUp(patch: Patch): boolean {
  return SENSITIVE_KEYS.some((key) => key in patch);
}

const LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  email: "Sign-in email",
  phone: "Phone",
  avatar_url: "Avatar",
  account_status: "Account status",
  location: "Address and service location",
  notifications: "Notification preferences",
  projects: "Project details",
  business_name: "Business name",
  headline: "Headline",
  bio: "Bio",
  primary_trade: "Primary trade",
  license_number: "License number",
  insurance_carrier: "Insurance carrier",
  approval_status: "Approval status",
  directory_hidden: "Directory visibility",
  service_category_ids: "Services",
  service_areas: "Service areas and radius",
  credentials: "Credentials",
  portfolio: "Portfolio captions and photo approval",
};

export function describePatch(patch: Patch): string[] {
  return Object.keys(patch).map((key) => LABELS[key] ?? key);
}

// ---------- server calls ----------

type RpcError = { message: string; code?: string } | null;

function rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }> {
  const supabase = getSupabaseClient();
  if (!supabase) return Promise.resolve({ data: null, error: { message: "Supabase is not configured yet." } });
  const call = supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError }>;
  return call(name, args);
}

export async function fetchCustomerEditor(profileId: string): Promise<CustomerEditor> {
  const data = await runSensitiveAdminCall(() => rpc("admin_get_customer_editor", { p_profile_id: profileId }), "Could not load the editor.");
  return parseCustomerEditor(data);
}

export async function saveCustomerProfile(profileId: string, patch: Patch, reason: string): Promise<CustomerEditor> {
  assertNoMoneyKeys(patch);
  const note = validateReason(reason);
  const data = await runSensitiveAdminCall(
    () => rpc("admin_update_customer_profile", { p_profile_id: profileId, p_patch: patch, p_reason: note }),
    "Could not save those changes.",
  );
  return parseCustomerEditor(data);
}

export async function fetchContractorEditor(contractorProfileId: string): Promise<ContractorEditor> {
  const data = await runSensitiveAdminCall(
    () => rpc("admin_get_contractor_editor", { p_contractor_profile_id: contractorProfileId }),
    "Could not load the editor.",
  );
  return parseContractorEditor(data);
}

export async function saveContractorProfile(contractorProfileId: string, patch: Patch, reason: string): Promise<ContractorEditor> {
  assertNoMoneyKeys(patch);
  const note = validateReason(reason);
  const data = await runSensitiveAdminCall(
    () => rpc("admin_update_contractor_profile", { p_contractor_profile_id: contractorProfileId, p_patch: patch, p_reason: note }),
    "Could not save those changes.",
  );
  return parseContractorEditor(data);
}
