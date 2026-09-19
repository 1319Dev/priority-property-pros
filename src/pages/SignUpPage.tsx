import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { isPublicSignupType } from "../lib/auth/roles";
import type { PublicSignupType } from "../lib/auth/types";
import { useAuth } from "../lib/auth/useAuth";
import {
  CONTRACTOR_SIGNUP_LEDE,
  CUSTOMER_SIGNUP_LEDE,
  SIGNUP_FEE_CHECKOUT_NOTE,
  SIGNUP_TERMS_ACCEPTANCE,
  VERIFIER_SIGNUP_LEDE,
} from "../data/pricing";
import { preHireContactError, PRE_HIRE_CONTACT_HINT } from "../lib/marketplace/antiCircumvention";

const copy: Record<PublicSignupType, { eyebrow: string; title: string; lede: string }> = {
  CUSTOMER: { eyebrow: "Customer", title: "Create a customer account.", lede: CUSTOMER_SIGNUP_LEDE },
  CONTRACTOR: { eyebrow: "Priority Pro", title: "Apply as an independent contractor.", lede: CONTRACTOR_SIGNUP_LEDE },
  VERIFIER: { eyebrow: "Verifier", title: "Apply as an independent verifier.", lede: VERIFIER_SIGNUP_LEDE },
};

export function SignUpPage() {
  const { role } = useParams();
  const requested = (role ?? "").toUpperCase();
  if (!isPublicSignupType(requested)) {
    return <Navigate to="/sign-up" replace />;
  }
  return <SignUpForm accountType={requested} />;
}

function SignUpForm({ accountType }: { accountType: PublicSignupType }) {
  const { signUp, configured } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    businessName: "",
    primaryTrade: "",
    serviceArea: "",
    coverageArea: "",
    bio: "",
  });

  function set(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (values.password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    const contactError =
      preHireContactError(values.bio) ||
      preHireContactError(values.businessName) ||
      preHireContactError(values.primaryTrade) ||
      preHireContactError(values.serviceArea);
    if (contactError) {
      setError(contactError);
      return;
    }
    setBusy(true);
    const result = await signUp({
      email: values.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      accountType,
      acceptedTerms: accepted,
      businessName: values.businessName,
      primaryTrade: values.primaryTrade,
      serviceArea: values.serviceArea,
      coverageArea: values.coverageArea,
      bio: values.bio,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(`/auth/verify?state=check-email&email=${encodeURIComponent(values.email)}`, { replace: true });
  }

  const labels = copy[accountType];

  return (
    <AuthCard
      eyebrow={labels.eyebrow}
      title={labels.title}
      lede={labels.lede}
      footer={
        <>
          Wrong role?{" "}
          <Link to="/sign-up" className="font-semibold text-forest-800 underline">
            Choose again
          </Link>
          . Admin accounts are not created here.
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="First name"
            name="firstName"
            autoComplete="given-name"
            required
            value={values.firstName}
            onChange={(e) => set("firstName", e.target.value)}
          />
          <TextInput
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            required
            value={values.lastName}
            onChange={(e) => set("lastName", e.target.value)}
          />
        </div>
        <TextInput
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
        />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
        />
        <TextInput
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
        {accountType === "CONTRACTOR" ? (
          <>
            <TextInput
              label="Business name"
              name="businessName"
              required
              value={values.businessName}
              onChange={(e) => set("businessName", e.target.value)}
            />
            <TextInput
              label="Primary trade"
              name="primaryTrade"
              hint="Example: fencing, handyman, lawn care."
              value={values.primaryTrade}
              onChange={(e) => set("primaryTrade", e.target.value)}
            />
            <TextInput
              label="Service area"
              name="serviceArea"
              hint="City or county you cover."
              value={values.serviceArea}
              onChange={(e) => set("serviceArea", e.target.value)}
            />
          </>
        ) : null}
        {accountType === "VERIFIER" ? (
          <>
            <TextInput
              label="Coverage area"
              name="coverageArea"
              value={values.coverageArea}
              onChange={(e) => set("coverageArea", e.target.value)}
            />
            <TextInput
              label="Short bio"
              name="bio"
              hint={PRE_HIRE_CONTACT_HINT}
              value={values.bio}
              onChange={(e) => set("bio", e.target.value)}
            />
          </>
        ) : null}
        <label className="flex items-start gap-3 text-sm text-ink-700">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-forest-800"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
          />
          <span>
            {SIGNUP_TERMS_ACCEPTANCE}
          </span>
        </label>
        <FormError message={error} />
        <Button type="submit" disabled={busy || !configured} aria-describedby="signup-fee-note">
          {busy ? "Creating account…" : "Create account"}
        </Button>
        <p id="signup-fee-note" className="text-sm text-ink-500">
          {SIGNUP_FEE_CHECKOUT_NOTE}
        </p>
      </form>
    </AuthCard>
  );
}
