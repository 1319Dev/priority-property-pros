import { unauthorizedPayloadLeaksPrivateContact } from "./bookings";

/** Shown on the customer control. Sharing is optional and pair-scoped. */
export const SHARE_CONTACT_BUTTON_LABEL = "Share my contact & address";

export const SHARE_CONTACT_COPY =
  "Optional. This shares your name, phone, email, and the address saved on your profile and this project with this connected contractor only. It does not put them in the message. The message box still blocks phone numbers, emails, and street addresses. Public storefronts stay anonymized.";

export const SHARE_CONTACT_CONFIRM_TITLE = "Share your contact and address?";

export const SHARE_CONTACT_CONFIRM_BODY =
  "Only this contractor will see them. Other pros will not. You can keep messaging without sharing.";

export const SHARE_CONTACT_DONE_TITLE = "Shared with this contractor";

export const SHARE_CONTACT_DONE_BODY =
  "This contractor can see the name, phone, email, and address below. The message thread still blocks phone numbers, emails, and street addresses.";

export const SHARE_CONTACT_WAITING_COPY =
  "This customer has not shared contact yet. Phone, email, and street stay hidden until they use Share my contact & address.";

export const SHARE_CONTACT_LOCKED_BODY =
  "Sharing stays locked until the $4.99 connection is unlocked for this contractor on this project.";

export const CONTACT_SHARED_NOTIFICATION_BODY = "The customer shared project contact with you.";

export type ContactShareAudience = "customer" | "contractor";

export type SharedContactView = {
  eligible: boolean;
  customer_shared: boolean;
  name: string | null;
  phone: string | null;
  email: string | null;
  street_line1: string | null;
  street_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

const EMPTY_SHARE: SharedContactView = {
  eligible: false,
  customer_shared: false,
  name: null,
  phone: null,
  email: null,
  street_line1: null,
  street_line2: null,
  city: null,
  state: null,
  zip_code: null,
};

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Allowlist. Contractors do not receive name, phone, email, or street until
 * the customer has shared. Extra keys such as lat, lng, and business_name drop.
 */
export function sanitizeSharedContact(value: unknown, audience: ContactShareAudience): SharedContactView {
  if (!value || typeof value !== "object") return { ...EMPTY_SHARE };
  const row = value as Record<string, unknown>;
  const eligible = row.eligible === true;
  const customerShared = row.customer_shared === true;
  const reveal = audience === "customer" ? eligible : eligible && customerShared;
  if (!reveal) {
    return {
      ...EMPTY_SHARE,
      eligible,
      customer_shared: audience === "contractor" ? false : customerShared,
    };
  }
  return {
    eligible,
    customer_shared: customerShared,
    name: textOrNull(row.name),
    phone: textOrNull(row.phone),
    email: textOrNull(row.email),
    street_line1: textOrNull(row.street_line1),
    street_line2: textOrNull(row.street_line2),
    city: textOrNull(row.city),
    state: textOrNull(row.state),
    zip_code: textOrNull(row.zip_code),
  };
}

export function shareButtonVisible(view: SharedContactView | null): boolean {
  return view?.eligible === true && view.customer_shared === false;
}

export function contractorMaySeeSharedContact(view: SharedContactView | null): boolean {
  return view?.eligible === true && view.customer_shared === true;
}

export function formatSharedAddress(
  view: Pick<SharedContactView, "street_line1" | "street_line2" | "city" | "state" | "zip_code">,
): string | null {
  const street = [view.street_line1, view.street_line2].filter(Boolean).join(", ");
  const place = [view.city, view.state].filter(Boolean).join(", ");
  const cityLine = [place, view.zip_code].filter(Boolean).join(" ");
  const parts = [street, cityLine].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * After the share migration, customer_shared false hides contact.
 * A payload from before that migration has no flag and still carries the fields
 * the connection entitlement already returned.
 */
export function jobContactWasShared(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload) return false;
  if (payload.customer_shared === false) return false;
  if (payload.customer_shared === true) return true;
  return unauthorizedPayloadLeaksPrivateContact(payload);
}

export function customerFacingShareError(message: string | null | undefined): string {
  const text = message ?? "";
  if (/contact share is locked|messaging is locked|\$4\.99 connection entitlement/i.test(text)) {
    return SHARE_CONTACT_LOCKED_BODY;
  }
  if (/only the customer can share/i.test(text)) return "Only the customer on this project can share contact.";
  return "Could not share contact.";
}
