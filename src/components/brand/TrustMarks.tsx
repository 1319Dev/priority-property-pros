import type { ReactNode } from "react";

export const TRUST_MARKS = [
  {
    id: "approved",
    title: "Approved Pros",
    body: "An admin approves the account before matching. Approval is not a background check, and it is not license or insurance verification.",
  },
  {
    id: "private",
    title: "Your information stays private",
    body: "Phone, email, and street address stay off public pages until contact is entitled.",
  },
  {
    id: "reviews",
    title: "Real projects. Real reviews.",
    body: "Reviews come from signed-in accounts. They are not Google reviews and not stock testimonials.",
  },
  {
    id: "local",
    title: "Local independents",
    body: "You hire independent local contractors. Priority Property Pros is the marketplace, not the crew.",
  },
] as const;

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none">
      {children}
    </svg>
  );
}

export function TrustMarkIcon({ id }: { id: (typeof TRUST_MARKS)[number]["id"] }) {
  if (id === "approved") {
    return (
      <IconFrame>
        <path d="M12 3 5 6v6c0 4.2 2.8 6.8 7 8 4.2-1.2 7-3.8 7-8V6l-7-3Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 12.2 11 14.2 15.2 9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </IconFrame>
    );
  }
  if (id === "private") {
    return (
      <IconFrame>
        <rect x="6" y="10" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </IconFrame>
    );
  }
  if (id === "reviews") {
    return (
      <IconFrame>
        <path
          d="m12 4.2 1.8 3.7 4 .6-2.9 2.8.7 4.1L12 13.5 8.4 15.4l.7-4.1L6.2 8.5l4-.6L12 4.2Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </IconFrame>
    );
  }
  return (
    <IconFrame>
      <path d="M4 11.2 12 4.5l8 6.7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 10.5V19h10v-8.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </IconFrame>
  );
}

export function TrustMarkList({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2"}>
      {TRUST_MARKS.map((mark) => (
        <li key={mark.id} className="flex gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-forest-800 text-gold-300">
            <TrustMarkIcon id={mark.id} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-forest-800">{mark.title}</span>
            {compact ? null : <span className="mt-1 block text-sm leading-relaxed text-ink-700">{mark.body}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
