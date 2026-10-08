import { NavLink } from "react-router-dom";
import { LoaderSlot } from "../brand/BrandLoader";
import { useAuth } from "../../lib/auth/useAuth";
import { authAwarePostPath, dashboardPath, showContractorSignup } from "../../lib/auth/publicEntry";
import { FIND_A_PRO_PATH } from "../../lib/marketplace/findAPro";

export function BottomNav() {
  const { loading, user, account_type, account_status, signup_fee_enabled, signup_fee_status } = useAuth();
  const accountTo = user
    ? dashboardPath({
        accountType: account_type,
        accountStatus: account_status,
        signupFeeEnabled: signup_fee_enabled,
        signupFeeStatus: signup_fee_status,
      })
    : "/sign-in";
  const accountLabel = user ? "Dashboard" : "Sign in";
  const postTo = authAwarePostPath("/post-project", { loading, accountType: account_type });
  const showProSignup = showContractorSignup({ loading, accountType: account_type });
  const home = dashboardPath({
    accountType: account_type,
    accountStatus: account_status,
    signupFeeEnabled: signup_fee_enabled,
    signupFeeStatus: signup_fee_status,
  });

  const items: Array<{
    key: string;
    to: string;
    label: string;
    icon: typeof HomeIcon;
    end: boolean;
    prominent?: boolean;
    placeholder?: boolean;
    ariaLabel?: string;
  }> = [
    { key: "home", to: "/", label: "Home", icon: HomeIcon, end: true },
    { key: "find", to: FIND_A_PRO_PATH, label: "Find", icon: FindIcon, end: false },
    { key: "post", to: postTo, label: "Post", icon: PostIcon, end: false, prominent: true },
    showProSignup
      ? { key: "pros", to: "/become-a-pro", label: "Pros", icon: ProIcon, end: false }
      : loading
        ? { key: "pros", to: "/become-a-pro", label: "Pros", icon: ProIcon, end: false, placeholder: true }
        : { key: "pros", to: home, label: "Dashboard", icon: ProIcon, end: false, ariaLabel: "My dashboard" },
    loading
      ? { key: "account", to: "/", label: "Loading…", icon: SignIcon, end: false, placeholder: true }
      : { key: "account", to: accountTo, label: accountLabel, icon: SignIcon, end: false },
  ];

  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-forest-800/10 bg-cream-50/95 pb-safe backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1">
        {items.map((item) => (
          <li key={item.key} className="flex min-w-0 justify-center">
            {item.placeholder ? (
              item.key === "account" ? (
                <LoaderSlot compact />
              ) : (
                <span className="flex min-h-12 w-full" aria-hidden="true" />
              )
            ) : (
            <NavLink
              to={item.to}
              end={item.end}
              aria-label={item.ariaLabel ?? item.label}
              className={({ isActive }) =>
                `flex min-h-12 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 py-1 text-center text-xs leading-tight font-semibold ${
                  item.prominent
                    ? "text-forest-950"
                    : isActive
                      ? "text-forest-800"
                      : "text-ink-500"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      item.prominent
                        ? "-mt-5 mb-0.5 grid h-12 w-12 place-items-center rounded-full bg-gold-500 text-forest-950 shadow-md"
                        : ""
                    }
                  >
                    <item.icon active={isActive || Boolean(item.prominent)} />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.5 L12 5 L20 11.5 V20 H15 V14 H9 V20 H4 Z"
        stroke={active ? "#1A3C2E" : "#6B645A"}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FindIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6" stroke={active ? "#1A3C2E" : "#6B645A"} strokeWidth="1.7" />
      <path d="M16 16 L20 20" stroke={active ? "#1A3C2E" : "#6B645A"} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PostIcon({ active = true }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-active={active}>
      <path d="M12 6 V18 M6 12 H18" stroke="#0A1612" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ProIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 10 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M5 19 c1.5-3 4-4.5 7-4.5 s5.5 1.5 7 4.5"
        stroke={active ? "#1A3C2E" : "#6B645A"}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SignIcon({ active }: { active: boolean }) {
  const stroke = active ? "#1A3C2E" : "#6B645A";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke={stroke} strokeWidth="1.7" />
      <path
        d="M5.5 19 c1.6-3.2 3.8-4.7 6.5-4.7 s4.9 1.5 6.5 4.7"
        stroke={stroke}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
