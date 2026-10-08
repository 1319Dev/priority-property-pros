import { Link, Navigate } from "react-router-dom";
import { BrandLoader } from "../components/brand/BrandLoader";
import { useAuth } from "../lib/auth/useAuth";
import { accountSettingsPath } from "../lib/auth/roles";

export function NotificationsPage() {
  const { loading, user, account_type, account_status } = useAuth();
  if (loading) return <BrandLoader label="Loading notification settings…" />;
  if (!user || !account_type) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-4xl font-semibold text-forest-800">Notification settings</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">Sign in to choose which alerts you get.</p>
        <Link
          to="/sign-in"
          className="mt-6 inline-flex min-h-12 items-center rounded-full bg-forest-800 px-5 text-sm font-semibold text-cream-50"
        >
          Sign in
        </Link>
      </div>
    );
  }
  const settings = accountSettingsPath(account_type, account_status);
  const target = settings.startsWith("/app/") ? `${settings}/notifications` : settings;
  return <Navigate to={target} replace />;
}
