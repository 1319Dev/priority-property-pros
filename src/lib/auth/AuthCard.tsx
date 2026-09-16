import type { ReactNode } from "react";
import { Container } from "../../components/ui/Container";
import { isSupabaseConfigured } from "../supabase/config";

export function AuthCard({
  eyebrow,
  title,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-lg">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-forest-800">{title}</h1>
        {!isSupabaseConfigured() ? <NotConfiguredBanner /> : null}
        <div className="mt-8 space-y-4">{children}</div>
        {footer ? <div className="mt-8 text-sm text-ink-700">{footer}</div> : null}
      </Container>
    </section>
  );
}

export function NotConfiguredBanner() {
  return (
    <div
      className="mt-6 rounded-2xl border border-gold-500/40 bg-cream-100 px-4 py-3 text-sm text-ink-700"
      role="status"
    >
      Live login is not connected yet. The owner still needs to create a Supabase project and add the public
      URL + anon key. See <span className="font-semibold text-forest-800">docs/SUPABASE_SETUP.md</span>. You
      can still browse the homepage.
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-2xl bg-danger-600/10 px-4 py-3 text-sm text-danger-600" role="alert">
      {message}
    </p>
  );
}
