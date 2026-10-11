import type { PublicSignupType } from "./types";
import { preHireContactError } from "../marketplace/antiCircumvention";

export const MIN_SIGNUP_PASSWORD_LENGTH = 8;

export type SignupField =
  | "firstName"
  | "lastName"
  | "email"
  | "password"
  | "confirmPassword"
  | "businessName"
  | "primaryTrade"
  | "serviceArea";

export type SignupFieldErrors = Partial<Record<SignupField, string>>;

export type SignupFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  businessName: string;
  primaryTrade: string;
  serviceArea: string;
  accountType: PublicSignupType;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field order used to focus the first problem. */
export const SIGNUP_FIELD_ORDER: readonly SignupField[] = [
  "firstName",
  "lastName",
  "email",
  "password",
  "confirmPassword",
  "businessName",
  "primaryTrade",
  "serviceArea",
];

export function validateSignupForm(input: SignupFormValues): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  if (!input.firstName.trim()) errors.firstName = "Enter your first name.";
  if (!input.lastName.trim()) errors.lastName = "Enter your last name.";

  const email = input.email.trim();
  if (!email) errors.email = "Enter your email.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter an email address like name@example.com.";

  if (!input.password) errors.password = "Enter a password.";
  else if (input.password.length < MIN_SIGNUP_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_SIGNUP_PASSWORD_LENGTH} characters.`;
  }

  if (!input.confirmPassword) errors.confirmPassword = "Confirm your password.";
  else if (input.password && input.confirmPassword !== input.password) {
    errors.confirmPassword = "Those passwords do not match.";
  }

  if (input.accountType === "CONTRACTOR") {
    if (!input.businessName.trim()) errors.businessName = "Enter your business name.";
    const businessError = preHireContactError(input.businessName);
    const tradeError = preHireContactError(input.primaryTrade);
    const areaError = preHireContactError(input.serviceArea);
    if (businessError) errors.businessName = businessError;
    if (tradeError) errors.primaryTrade = tradeError;
    if (areaError) errors.serviceArea = areaError;
  }

  return errors;
}

export function firstSignupField(errors: SignupFieldErrors): SignupField | null {
  return SIGNUP_FIELD_ORDER.find((field) => errors[field]) ?? null;
}
