import { NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth/useAuth";
import { postLoginPath } from "../../lib/auth/roles";

export function BottomNav() {
  const { loading, user, account_type, account_status, signup_fee_enabled, signup_fee_status } = useAuth();
  const accountTo = user
    ? postLoginPath(account_type, account_status, { enabled: signup_fee_enabled, status: signup_fee_status })
    : "/sign-in";
  const accountLabel = user ? "Account" : "Sign in";

  const items = [
    { to: "/", label: "Home", icon: HomeIcon, end: true },
    { to: "/find-a-pro", label: "Find", icon: FindIcon, end: false },
    { to: "/post-project", label: "Post", icon: PostIcon, end: false, prominent: true },
    { to: "/become-a-pro", label: "Pros", icon: ProIcon, end: false },
    { to: accountTo, label: loading ? "…" : accountLabel, icon: SignIcon, end: false },
  ];

  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-forest-800/10 bg-cream-50/95 pb-safe backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 px-2 pt-1">
        {items.map((item) => (
          <li key={item.label} className="flex justify-center">
            <NavLink
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) =>
                `flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1 text-[0.65rem] font-semibold ${
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
