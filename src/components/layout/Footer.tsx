import { Link } from "react-router-dom";
import { COMPANY_NAME, PRODUCT_NAME } from "../../data/brand";
import { SIGNUP_FEE_SHORT } from "../../data/pricing";
import { Logo } from "../brand/Logo";
import { Container } from "../ui/Container";

const footerLinks = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/find-a-pro", label: "Find a pro" },
  { to: "/pricing", label: "Pricing" },
  { to: "/become-a-pro", label: "Become a pro" },
  { to: "/post-project", label: "Post a project" },
  { to: "/trust", label: "Trust & safety" },
  { to: "/sign-in", label: "Sign in" },
  { to: "/sign-up", label: "Create account" },
];

export function Footer() {
  return (
    <footer className="mt-8 border-t border-forest-800/10 bg-forest-900 text-cream-100">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-cream-200">
            {PRODUCT_NAME} is a local marketplace. Independent contractors do the work.
            {` `}
            {COMPANY_NAME} is not the contractor, not a franchise, and not affiliated with Angi or Thumbtack.
            {` `}
            Join for a {SIGNUP_FEE_SHORT} — not a monthly subscription.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gold-300">
            Explore
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {footerLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="min-h-11 inline-flex items-center text-cream-50 hover:text-gold-300">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <div className="border-t border-cream-50/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-cream-200 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <p>A marketplace, not a crew. Online payment setup is coming soon.</p>
        </Container>
      </div>
    </footer>
  );
}
