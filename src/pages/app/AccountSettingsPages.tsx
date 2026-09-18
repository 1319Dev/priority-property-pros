import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/Input";
import { FormError } from "../../lib/auth/AuthCard";
import { useAuth } from "../../lib/auth/useAuth";
import { CUSTOMER_DASHBOARD_PRICING_NOTE, PRO_DASHBOARD_PRICING_NOTE } from "../../data/pricing";
import { LEGAL_PAGES } from "../../data/legal";
import { fetchMyRatingStats, requestAccountDeletion } from "../../lib/marketplace/api";
import { accountStatusLabel, accountTypeLabel } from "../../lib/marketplace/statusLabels";
import { DELETE_CONFIRM_PHRASE, DELETION_CONSEQUENCES, deletionConfirmError } from "../../lib/trust/deletion";
import { restrictionBanner } from "../../lib/trust/restrictions";

function disputesPath(accountType: string | null): string {
  if (accountType === "CONTRACTOR") return "/app/pro/account/disputes";
  if (accountType === "VERIFIER") return "/app/verifier/account/disputes";
  if (accountType === "ADMIN") return "/app/admin/account/disputes";
  return "/app/customer/account/disputes";
}

export function AccountPage() {
  const { profile, user, signOut, signIn, account_type, account_status, refreshProfile } = useAuth();
  const [rating, setRating] = useState<string>("—");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = restrictionBanner(account_status);

  useEffect(() => {
    void fetchMyRatingStats()
      .then((row) => {
        const count = Number(row.eligible_count ?? 0);
        const avg = row.rating_average == null ? null : Number(row.rating_average);
        setRating(count === 0 || avg == null ? "No eligible PPP reviews yet" : `${avg.toFixed(2)} from ${count} eligible review${count === 1 ? "" : "s"}`);
      })
      .catch(() => setRating("Ratings load when the marketplace is connected."));
  }, []);

  async function onDelete(event: FormEvent) {
    event.preventDefault();
    const phraseError = deletionConfirmError(confirm);
    if (phraseError) {
      setError(phraseError);
      return;
    }
    if (!user?.email || password.length < 8) {
      setError("Re-enter your password to close this account.");
      return;
    }
    setBusy(true);
    setError(null);
    const auth = await signIn(user.email, password);
    if (auth.error) {
      setBusy(false);
      setError(auth.error);
      return;
    }
    try {
      await requestAccountDeletion(confirm);
      await refreshProfile();
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Account</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Your profile</h1>
      </header>
      {notice ? <p className="rounded-3xl bg-gold-500/20 px-5 py-4 text-sm text-forest-950">{notice}</p> : null}
      <dl className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <Row label="Name" value={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "—"} />
        <Row label="Email" value={user?.email ?? profile?.email ?? "—"} />
        <Row label="Role" value={accountTypeLabel(account_type)} />
        <Row label="Status" value={accountStatusLabel(account_status)} />
        <Row label="PPP rating" value={rating} />
      </dl>
      <p className="text-sm text-ink-500">
        This website cannot promote anyone to Admin.
        {account_type === "CUSTOMER" ? ` ${CUSTOMER_DASHBOARD_PRICING_NOTE}` : ""}
        {account_type === "CONTRACTOR" ? ` ${PRO_DASHBOARD_PRICING_NOTE}` : ""}
      </p>
      <Link to={disputesPath(account_type)} className="inline-flex min-h-12 items-center font-semibold text-forest-800 underline">
        Disputes and rating appeals
      </Link>
      <section>
        <h2 className="font-display text-2xl text-forest-800">Policies</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {LEGAL_PAGES.map((page) => (
            <li key={page.slug}>
              <Link to={page.path} className="font-semibold text-forest-800 underline">
                {page.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl border border-danger-600/20 px-5 py-5">
        <h2 className="font-display text-2xl text-forest-800">Delete account</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
          {DELETION_CONSEQUENCES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <form className="mt-4 space-y-3" onSubmit={onDelete}>
          <TextInput
            label={`Type ${DELETE_CONFIRM_PHRASE} to confirm`}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <TextInput
            label="Re-enter your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" variant="outline" className="min-h-14 w-full" disabled={busy}>
            {busy ? "Closing account…" : "Delete my account"}
          </Button>
        </form>
      </section>
      <Button type="button" variant="outline" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold uppercase tracking-[0.14em] text-gold-700">{label}</dt>
      <dd className="text-ink-900">{value}</dd>
    </div>
  );
}
