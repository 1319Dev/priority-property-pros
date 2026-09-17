import { Link } from "react-router-dom";
import { AuthCard } from "../lib/auth/AuthCard";

const options = [
  {
    to: "/sign-up/customer",
    label: "I need work done",
    detail: "Homeowners and property owners. $9.99 one-time account signup. No homeowner subscription.",
  },
  {
    to: "/sign-up/contractor",
    label: "I want to get hired",
    detail: "Independent contractors. Get started for $9.99. No monthly subscription required on the Free plan.",
  },
  {
    to: "/sign-up/verifier",
    label: "I want to verify completed jobs",
    detail: "Independent completion verifiers. Priority Verified is not live yet.",
  },
];

export function SignUpRolePage() {
  return (
    <AuthCard
      eyebrow="Create account"
      title="How will you use Priority Property Pros?"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/sign-in" className="font-semibold text-forest-800 underline">
            Sign in
          </Link>
          . There is no public Admin signup.
        </>
      }
    >
      <ul className="space-y-3">
        {options.map((option) => (
          <li key={option.to}>
            <Link
              to={option.to}
              className="block rounded-3xl border border-forest-800/15 bg-cream-50 px-5 py-4 transition-colors hover:border-forest-800 hover:bg-cream-100"
            >
              <p className="font-semibold text-forest-800">{option.label}</p>
              <p className="mt-1 text-sm text-ink-700">{option.detail}</p>
            </Link>
          </li>
        ))}
      </ul>
    </AuthCard>
  );
}
