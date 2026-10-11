import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BrandLoader } from "../components/brand/BrandLoader";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { AuthCard, FormError } from "../lib/auth/AuthCard";
import { dashboardPath } from "../lib/auth/publicEntry";
import { isPublicSignupType, requestsVerifierSignup } from "../lib/auth/roles";
import { firstSignupField, validateSignupForm, type SignupField, type SignupFieldErrors } from "../lib/auth/signupForm";
import type { PublicSignupType } from "../lib/auth/types";
import { useAuth } from "../lib/auth/useAuth";
import {
  CONTRACTOR_ACCOUNT_DIFFERENCE,
  CONTRACTOR_SIGNUP_LEDE,
  CUSTOMER_ACCOUNT_DIFFERENCE,
  CUSTOMER_SIGNUP_LEDE,
  SIGNUP_BEFORE_CHECKOUT,
  SIGNUP_BEFORE_CHECKOUT_NOT_LIVE,
  SIGNUP_FEE_CHECKOUT_LIVE_NOTE,
  SIGNUP_FEE_CHECKOUT_NOTE,
  SIGNUP_TERMS_ACCEPTANCE,
} from "../data/pricing";
import { fetchSignupFeeCheckoutFlags } from "../lib/signupFee/api";

const copy: Record<PublicSignupType, { eyebrow: string; title: string; lede: string }> = {
  CUSTOMER: { eyebrow: "Customer", title: "Create a customer account.", lede: CUSTOMER_SIGNUP_LEDE },
  CONTRACTOR: { eyebrow: "Priority Pro", title: "Apply as an independent contractor.", lede: CONTRACTOR_SIGNUP_LEDE },
};

export function SignUpPage() {
  const { role } = useParams();
  const [params] = useSearchParams();
  const requested = (role ?? "").trim().toUpperCase();
  if (
    requestsVerifierSignup([
      role,
      params.get("role"),
      params.get("account_type"),
      params.get("accountType"),
      params.get("type"),
    ]) ||
    !isPublicSignupType(requested)
  ) {
    return <Navigate to="/sign-up" replace />;
  }
  return <SignUpForm accountType={requested} />;
}

function SignUpForm({ accountType }: { accountType: PublicSignupType }) {
  const { signUp, configured, loading, user, account_type, account_status, signup_fee_enabled, signup_fee_status } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [checkoutLive, setCheckoutLive] = useState(false);
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    businessName: "",
    primaryTrade: "",
    serviceArea: "",
  });

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void fetchSignupFeeCheckoutFlags().then((flags) => {
      if (!cancelled) setCheckoutLive(flags.enabled === true);
    });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  if (loading) return <BrandLoader layout="page" label="Loading…" />;
  const customerBecomingPro = account_type === "CUSTOMER" && accountType === "CONTRACTOR";
  if (user && account_type && !customerBecomingPro) {
    return (
      <Navigate
        to={dashboardPath({
          accountType: account_type,
          accountStatus: account_status,
          signupFeeEnabled: signup_fee_enabled,
          signupFeeStatus: signup_fee_status,
        })}
        replace
      />
    );
  }

  function set(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    if (name in fieldErrors) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[name as SignupField];
        return next;
      });
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextErrors = validateSignupForm({
      ...values,
      accountType,
    });
    setFieldErrors(nextErrors);
    const first = firstSignupField(nextErrors);
    if (first) {
      event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
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
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(`/auth/verify?state=check-email&email=${encodeURIComponent(values.email)}`, { replace: true });
  }

  const labels = copy[accountType];
  const fieldMessages = Object.values(fieldErrors);

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
      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        <div id="signup-account-difference" className="rounded-3xl border border-forest-800/10 bg-cream-100 px-4 py-3 text-sm leading-relaxed text-ink-700">
          <p>{accountType === "CONTRACTOR" ? CONTRACTOR_ACCOUNT_DIFFERENCE : CUSTOMER_ACCOUNT_DIFFERENCE}</p>
          <p className="mt-2">{checkoutLive ? SIGNUP_BEFORE_CHECKOUT : SIGNUP_BEFORE_CHECKOUT_NOT_LIVE}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="First name"
            name="firstName"
            autoComplete="given-name"
            aria-required="true"
            value={values.firstName}
            error={fieldErrors.firstName}
            onChange={(e) => set("firstName", e.target.value)}
          />
          <TextInput
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            aria-required="true"
            value={values.lastName}
            error={fieldErrors.lastName}
            onChange={(e) => set("lastName", e.target.value)}
          />
        </div>
        <TextInput
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          aria-required="true"
          value={values.email}
          error={fieldErrors.email}
          onChange={(e) => set("email", e.target.value)}
        />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-required="true"
          hint="At least 8 characters."
          value={values.password}
          error={fieldErrors.password}
          onChange={(e) => set("password", e.target.value)}
        />
        <TextInput
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-required="true"
          hint="Enter the same password again."
          value={values.confirmPassword}
          error={fieldErrors.confirmPassword}
          onChange={(e) => set("confirmPassword", e.target.value)}
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
              aria-required="true"
              value={values.businessName}
              error={fieldErrors.businessName}
              onChange={(e) => set("businessName", e.target.value)}
            />
            <TextInput
              label="Primary trade"
              name="primaryTrade"
              hint="Example: fencing, handyman, lawn care."
              value={values.primaryTrade}
              error={fieldErrors.primaryTrade}
              onChange={(e) => set("primaryTrade", e.target.value)}
            />
            <TextInput
              label="Service area"
              name="serviceArea"
              hint="City or county you cover."
              value={values.serviceArea}
              error={fieldErrors.serviceArea}
              onChange={(e) => set("serviceArea", e.target.value)}
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
        {fieldMessages.length > 0 ? (
          <div role="alert" className="rounded-2xl bg-danger-600/10 px-4 py-3 text-sm text-danger-600">
            <p>Fix the highlighted fields.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <FormError message={error} />
        <Button
          type="submit"
          disabled={busy || !configured}
          aria-describedby="signup-account-difference signup-fee-note"
        >
          {busy ? "Creating account…" : "Create account"}
        </Button>
        <p id="signup-fee-note" className="text-sm text-ink-500">
          {checkoutLive ? SIGNUP_FEE_CHECKOUT_LIVE_NOTE : SIGNUP_FEE_CHECKOUT_NOTE}
        </p>
      </form>
    </AuthCard>
  );
}
