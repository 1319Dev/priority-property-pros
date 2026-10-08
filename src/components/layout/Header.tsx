import { NavLink } from "react-router-dom";
import { Logo } from "../brand/Logo";
import { BrandLoader } from "../brand/BrandLoader";
import { Container } from "../ui/Container";
import { CUSTOMER_CTA } from "../../data/brand";
import { FIND_A_PRO_NAV_LABEL, FIND_A_PRO_PATH } from "../../lib/marketplace/findAPro";
import { dashboardPath, showContractorSignup } from "../../lib/auth/publicEntry";
import { useHidePlatformPricing } from "../../lib/auth/platformPricing";
import { useAuth } from "../../lib/auth/useAuth";
import { AccountMenu } from "../account/AccountMenu";
import { PostProjectLink } from "./PostProjectLink";

const links = [
  { to: FIND_A_PRO_PATH, label: FIND_A_PRO_NAV_LABEL },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/faq", label: "FAQ" },
];

export function Header() {
  const { loading, user, account_type, account_status, signup_fee_enabled, signup_fee_status } = useAuth();
  const showProSignup = showContractorSignup({ loading, accountType: account_type });
  const hidePricing = useHidePlatformPricing();
  const navLinks = hidePricing ? links.filter((link) => link.to !== "/pricing") : links;
  const home = dashboardPath({
    accountType: account_type,
    accountStatus: account_status,
    signupFeeEnabled: signup_fee_enabled,
    signupFeeStatus: signup_fee_status,
  });

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
        <div className="flex items-center gap-2 sm:gap-3">
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {navLinks.map((link) => (
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
              <span className="invisible rounded-full px-3 py-2 text-sm font-medium" aria-hidden="true">
                Become a Pro
              </span>
            ) : showProSignup ? (
              <NavLink
                to="/become-a-pro"
                className={({ isActive }) =>
                  `rounded-full px-3 py-2 text-sm font-medium ${
                    isActive ? "text-forest-800" : "text-ink-700 hover:text-forest-800"
                  }`
                }
              >
                Become a Pro
              </NavLink>
            ) : (
              <NavLink
                to={home}
                className="rounded-full px-3 py-2 text-sm font-medium text-ink-700 hover:text-forest-800"
              >
                My dashboard
              </NavLink>
            )}
            <PostProjectLink to="/post-project" size="sm" className="ml-2">
              {CUSTOMER_CTA}
            </PostProjectLink>
          </nav>
          {loading ? (
            <BrandLoader layout="inline" label="Loading…" />
          ) : user ? (
            <AccountMenu />
          ) : (
            <NavLink
              to="/sign-in"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-forest-800"
            >
              Sign In
            </NavLink>
          )}
        </div>
      </Container>
    </header>
  );
}
