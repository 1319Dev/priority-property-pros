import { HOW_FEES_WORK_BODY, HOW_FEES_WORK_SUMMARY } from "../../lib/marketplace/contractorPolish";

/** One contractor-only fee note. Customers do not render this. */
export function HowFeesWork() {
  return (
    <details className="rounded-3xl border border-gold-500/40 bg-cream-50 px-5 py-3 text-forest-800">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {HOW_FEES_WORK_SUMMARY}
      </summary>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-700">{HOW_FEES_WORK_BODY}</p>
    </details>
  );
}
