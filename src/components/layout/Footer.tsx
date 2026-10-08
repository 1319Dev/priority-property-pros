import { Link } from "react-router-dom";
import { COMPANY_NAME, PRODUCT_NAME, SUPPORT_EMAIL } from "../../data/brand";
import { FIND_A_PRO_NAV_LABEL, FIND_A_PRO_PATH } from "../../lib/marketplace/findAPro";
import { SIGNUP_FEE_PUBLIC_NOTE } from "../../data/pricing";
import { authAwarePostPath, dashboardPath, showContractorSignup } from "../../lib/auth/publicEntry";
import { useHidePlatformPricing } from "../../lib/auth/platformPricing";
import { useAuth } from "../../lib/auth/useAuth";
import { Logo } from "../brand/Logo";
import { Container } from "../ui/Container";

const footerLinks = [
  { to: "/how-it-works", label: "How it works" },
  { to: FIND_A_PRO_PATH, label: FIND_A_PRO_NAV_LABEL },
  { to: "/pricing", label: "Pricing" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
  { to: "/reviews", label: "Reviews" },
  { to: "/reviews", label: "Leave a review" },
  { to: "/trust", label: "Trust & safety" },
];

export function Footer() {
  const { loading, user, account_type, account_status, signup_fee_enabled, signup_fee_status, signOut } = useAuth();
  const postTo = authAwarePostPath("/post-project", { loading, accountType: account_type });
  const showProSignup = showContractorSignup({ loading, accountType: account_type });
  const hidePricing = useHidePlatformPricing();
  const exploreLinks = hidePricing ? footerLinks.filter((link) => link.to !== "/pricing") : footerLinks;
  const home = dashboardPath({
    accountType: account_type,
    accountStatus: account_status,
    signupFeeEnabled: signup_fee_enabled,
    signupFeeStatus: signup_fee_status,
  });

  return (
    <footer className="mt-8 border-t border-forest-800/10 bg-forest-900 pb-[calc(8rem+env(safe-area-inset-bottom))] text-cream-100 lg:pb-0">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-cream-200">
            {PRODUCT_NAME} is a local marketplace. Independent contractors do the work.
            {` `}
            {COMPANY_NAME} is not the contractor, not a franchise, and not affiliated with Angi or Thumbtack.
            {hidePricing ? "" : ` ${SIGNUP_FEE_PUBLIC_NOTE}`}
          </p>
          <p className="mt-4">
            <a className="text-sm font-semibold text-gold-300 underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
            Explore
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <li>
                <Link to={postTo} className="inline-flex min-h-11 min-w-11 items-center text-cream-50 hover:text-gold-300">
                Post a project
              </Link>
            </li>
            {exploreLinks.map((link) => (
              <li key={`${link.to}-${link.label}`}>
                <Link to={link.to} className="inline-flex min-h-11 min-w-11 items-center text-cream-50 hover:text-gold-300">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              {loading ? (
                <span className="invisible inline-flex min-h-11 items-center" aria-hidden="true">
                  Become a pro
                </span>
              ) : showProSignup ? (
                <Link to="/become-a-pro" className="inline-flex min-h-11 min-w-11 items-center text-cream-50 hover:text-gold-300">
                  Become a pro
                </Link>
              ) : (
                <Link to={home} className="inline-flex min-h-11 min-w-11 items-center text-cream-50 hover:text-gold-300">
                  My dashboard
                </Link>
              )}
            </li>
            {!loading && user && showProSignup ? (
              <li>
                <Link to={home} className="inline-flex min-h-11 min-w-11 items-center text-cream-50 hover:text-gold-300">
                  My dashboard
                </Link>
              </li>
            ) : null}
            {!loading && user ? (
              <li>
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center text-cream-50 hover:text-gold-300"
                  onClick={() => {
                    void signOut();
                  }}
                >
                  Sign out
                </button>
              </li>
            ) : null}
            {!loading && !user ? (
              <li>
                <Link to="/sign-in" className="inline-flex min-h-11 min-w-11 items-center text-cream-50 hover:text-gold-300">
                  Sign in
                </Link>
              </li>
            ) : null}
            {!loading && !user ? (
              <li>
                <Link to="/sign-up" className="inline-flex min-h-11 min-w-11 items-center text-cream-50 hover:text-gold-300">
                  Create account
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      </Container>
      <div className="border-t border-cream-50/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-cream-200 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <p>A marketplace, not a crew.</p>
        </Container>
      </div>
    </footer>
  );
}
