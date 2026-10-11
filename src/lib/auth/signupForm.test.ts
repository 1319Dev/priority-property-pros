import { describe, expect, it } from "vitest";
import { firstSignupField, validateSignupForm, type SignupFormValues } from "./signupForm";

function values(partial: Partial<SignupFormValues> = {}): SignupFormValues {
  return {
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    password: "password12",
    confirmPassword: "password12",
    businessName: "Lee Fencing",
    primaryTrade: "fencing",
    serviceArea: "Conroe",
    accountType: "CUSTOMER",
    ...partial,
  };
}

describe("validateSignupForm", () => {
  it("accepts a complete customer form", () => {
    expect(validateSignupForm(values())).toEqual({});
  });

  it("asks for each missing customer field in plain language", () => {
    const errors = validateSignupForm(
      values({
        firstName: " ",
        lastName: "",
        email: "",
        password: "",
        confirmPassword: "",
      }),
    );
    expect(errors.firstName).toMatch(/first name/i);
    expect(errors.lastName).toMatch(/last name/i);
    expect(errors.email).toMatch(/email/i);
    expect(errors.password).toMatch(/password/i);
    expect(errors.confirmPassword).toMatch(/confirm your password/i);
    expect(firstSignupField(errors)).toBe("firstName");
  });

  it("rejects a short password and a mismatch without saying which account exists", () => {
    expect(validateSignupForm(values({ password: "short", confirmPassword: "short" })).password).toMatch(/8 characters/);
    expect(validateSignupForm(values({ confirmPassword: "password13" })).confirmPassword).toMatch(/do not match/i);
  });

  it("rejects an email that is not an address", () => {
    expect(validateSignupForm(values({ email: "not-an-email" })).email).toMatch(/name@example.com/);
  });

  it("requires a business name for contractors and blocks contact details in public fields", () => {
    expect(validateSignupForm(values({ accountType: "CONTRACTOR", businessName: " " })).businessName).toMatch(
      /business name/i,
    );
    expect(
      validateSignupForm(values({ accountType: "CONTRACTOR", primaryTrade: "call 281-555-0100" })).primaryTrade,
    ).toMatch(/do not share phone numbers/i);
  });

  it("does not treat a customer phone number as a public-field contact leak", () => {
    expect(validateSignupForm(values())).not.toHaveProperty("phone");
  });
});
