import { HOW_FEES_WORK_BODY, HOW_FEES_WORK_SUMMARY, showActivationFeeNote } from "../../lib/marketplace/contractorPolish";
import type { SignupFeeStatus } from "../../lib/signupFee/constants";

/** One contractor-only fee note. Hidden once activation is paid or not required. */
export function HowFeesWork({ signupFeeStatus = null }: { signupFeeStatus?: SignupFeeStatus | null }) {
  if (!showActivationFeeNote(signupFeeStatus)) return null;
  return (
    <details className="rounded-3xl border border-gold-500/40 bg-cream-50 px-5 py-3 text-forest-800">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {HOW_FEES_WORK_SUMMARY}
      </summary>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-700">{HOW_FEES_WORK_BODY}</p>
    </details>
  );
}
