import { NavLink } from "react-router-dom";
import { Logo } from "../brand/Logo";
import { ButtonLink } from "../ui/Button";
import { Container } from "../ui/Container";
import { CUSTOMER_CTA } from "../../data/brand";
import { useAuth } from "../../lib/auth/useAuth";
import { postLoginPath } from "../../lib/auth/roles";
import { Skeleton } from "../ui/Skeleton";

const links = [
  { to: "/find-a-pro", label: "Find a Pro" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/become-a-pro", label: "Become a Pro" },
];

export function Header() {
  const { loading, user, account_type, account_status } = useAuth();
  const accountTo = user ? postLoginPath(account_type, account_status) : "/sign-in";
  const accountLabel = user ? "Account" : "Sign In";

  return (
    <header className="sticky top-0 z-40 border-b border-forest-800/10 bg-cream-50/90 pt-safe backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-forest-950"
      >
        Skip to content
      </a>
      <Container className="flex min-h-16 items-center justify-between gap-4 py-2">
        <NavLink to="/" aria-label="Priority Property Pros home" className="shrink-0">
          <Logo />
        </NavLink>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-full px-3 py-2 text-sm font-medium ${
                  isActive ? "text-forest-800" : "text-ink-700 hover:text-forest-800"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {loading ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <NavLink to={accountTo} className="rounded-full px-3 py-2 text-sm font-semibold text-forest-800">
              {accountLabel}
            </NavLink>
          )}
          <ButtonLink to="/post-project" size="sm" className="ml-2">
            {CUSTOMER_CTA}
          </ButtonLink>
        </nav>
        {loading ? (
          <Skeleton className="h-9 w-16 lg:hidden" />
        ) : (
          <NavLink
            to={accountTo}
            className="min-h-11 rounded-full px-3 text-sm font-semibold text-forest-800 lg:hidden"
          >
            {accountLabel}
          </NavLink>
        )}
      </Container>
    </header>
  );
}
