import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth/useAuth";
import { dashboardPath } from "../../lib/auth/publicEntry";
import { accountInitials, accountSettingsPath, displayName } from "../../lib/auth/roles";

export function AccountMenu() {
  const { user, profile, account_type, account_status, signup_fee_enabled, signup_fee_status, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const name = profile
    ? displayName(profile.first_name, profile.last_name, profile.email)
    : (user.email ?? "Account");
  const initials = accountInitials(profile?.first_name, profile?.last_name, user.email ?? profile?.email);
  const settingsTo = accountSettingsPath(account_type, account_status);
  const homeTo = dashboardPath({
    accountType: account_type,
    accountStatus: account_status,
    signupFeeEnabled: signup_fee_enabled,
    signupFeeStatus: signup_fee_status,
  });
  const shortName = profile?.first_name?.trim() || name.split(" ")[0] || "Account";

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-forest-800 pl-2 pr-2 text-sm font-semibold text-cream-50 min-[360px]:pl-2.5 min-[360px]:pr-3"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span
            className="grid h-7 w-7 place-items-center rounded-full bg-gold-500 text-xs font-bold text-forest-950"
            aria-hidden="true"
          >
            {initials}
          </span>
        )}
        <span className="hidden max-w-28 truncate min-[360px]:inline">{shortName}</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-64 rounded-3xl border border-forest-800/10 bg-cream-50 p-2 shadow-xl"
        >
          <p className="truncate px-3 py-2 text-sm text-ink-700">{name}</p>
          <Link
            role="menuitem"
            to={homeTo}
            className="flex min-h-12 items-center rounded-2xl px-3 text-sm font-semibold text-forest-800 hover:bg-cream-100"
            onClick={() => setOpen(false)}
          >
            My dashboard
          </Link>
          <Link
            role="menuitem"
            to={settingsTo}
            className="flex min-h-12 items-center rounded-2xl px-3 text-sm font-semibold text-forest-800 hover:bg-cream-100"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex min-h-12 w-full items-center rounded-2xl px-3 text-left text-sm font-semibold text-forest-800 hover:bg-cream-100"
            onClick={() => {
              void handleSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
