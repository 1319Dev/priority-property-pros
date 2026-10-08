import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { SUPPORT_EMAIL } from "../data/brand";
import { AuthCard } from "../lib/auth/AuthCard";
import { useAuth } from "../lib/auth/useAuth";

const messages: Record<string, string> = {
  SUSPENDED: "This account is suspended. Contact support if you believe that is a mistake.",
  DISABLED: "This account is disabled.",
  DELETED: "This account is closed.",
  PENDING: "This account is pending. Confirm your email, or wait for an admin review if you applied as a pro.",
};

export function AccountStatusPage() {
  const { account_status, signOut, user } = useAuth();
  const status = account_status ?? "PENDING";

  return (
    <AuthCard eyebrow="Account" title="This account cannot open the app yet.">
      <p className="text-ink-700">{messages[status] ?? messages.PENDING}</p>
      <p className="text-sm text-ink-500">{user?.email}</p>
      <p className="text-sm text-ink-700">
        Contact support at{" "}
        <a className="font-semibold text-forest-800 underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </Button>
        <Link to="/" className="inline-flex min-h-12 items-center font-semibold text-forest-800 underline">
          Back home
        </Link>
      </div>
    </AuthCard>
  );
}
