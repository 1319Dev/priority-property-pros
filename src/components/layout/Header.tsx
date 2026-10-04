import { NavLink } from "react-router-dom";
import { Logo } from "../brand/Logo";
import { ButtonLink } from "../ui/Button";
import { Container } from "../ui/Container";
import { CUSTOMER_CTA } from "../../data/brand";
import { REVIEWED_PROS_NAV_LABEL, REVIEWED_PROS_PATH } from "../../lib/marketplace/reviewedContractors";
import { useAuth } from "../../lib/auth/useAuth";
import { AccountMenu } from "../account/AccountMenu";
import { Skeleton } from "../ui/Skeleton";

const links = [
  { to: REVIEWED_PROS_PATH, label: REVIEWED_PROS_NAV_LABEL },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/become-a-pro", label: "Become a Pro" },
  { to: "/faq", label: "FAQ" },
];

export function Header() {
  const { loading, user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-forest-800/10 bg-cream-50/90 pt-safe backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-forest-950"
      >
        Skip to content
      </a>
      <Container className="flex min-h-16 items-center justify-between gap-2 py-2 sm:gap-4">
        <NavLink to="/" aria-label="Priority Property Pros home" className="min-w-0 shrink">
          <Logo />
        </NavLink>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
            <ButtonLink to="/post-project" size="sm" className="ml-2">
              {CUSTOMER_CTA}
            </ButtonLink>
          </nav>
          {loading ? (
            <Skeleton className="h-11 w-11 rounded-full" />
          ) : user ? (
            <AccountMenu />
          ) : (
            <NavLink
              to="/sign-in"
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold text-forest-800"
            >
              Sign In
            </NavLink>
          )}
        </div>
      </Container>
    </header>
  );
}
