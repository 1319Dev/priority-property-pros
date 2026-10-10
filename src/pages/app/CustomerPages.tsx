import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DeleteAccountDialog } from "../../components/account/DeleteAccountDialog";
import { BlockedProsList } from "../../components/marketplace/BlockedProsList";
import { TextInput } from "../../components/ui/Input";
import { useAuth } from "../../lib/auth/useAuth";
import { deleteOwnAccount } from "../../lib/auth/deleteAccount";
import { FormError } from "../../lib/auth/AuthCard";
import { getSupabaseClient } from "../../lib/supabase/client";
import { useHidePlatformPricing } from "../../lib/auth/platformPricing";
import { CUSTOMER_ACTIVATION_NOTE, CUSTOMER_PAYS_DIRECTLY } from "../../lib/marketplace/customerCopy";
import { accountRoleNote, activationStatusLine } from "../../lib/marketplace/contractorPolish";
import { SIGNUP_FEE_ACTIVATE_PATH } from "../../lib/signupFee/constants";
import { accountStatusLabel, accountTypeLabel } from "../../lib/marketplace/statusLabels";
import { accountSettingsPath } from "../../lib/auth/roles";

export { CustomerHomePage, CustomerProjectsPage } from "./customer/CustomerMarketplacePages";
export { CustomerMessagesPage } from "./messages/ProjectMessagesPage";

export function AccountPage() {
  const { profile, user, signOut, account_type, account_status, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const hidePricing = useHidePlatformPricing();
  const activation = activationStatusLine({
    status: profile?.signup_fee_status,
    paidAt: profile?.signup_fee_paid_at,
  });

  return (
    <div className="max-w-lg space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Settings</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Account settings</h1>
      </header>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const client = getSupabaseClient();
          if (!client || !profile) return;
          setSaving(true);
          setError(null);
          setSaved(null);
          void (async () => {
            const { error: updateError } = await client
              .from("profiles")
              .update({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                phone: phone.trim() || null,
              })
              .eq("id", profile.id);
            if (updateError) {
              setError(updateError.message);
              return;
            }
            await refreshProfile();
            setSaved("Name and phone saved.");
          })().finally(() => setSaving(false));
        }}
      >
        <TextInput label="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        <TextInput label="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
        <TextInput label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        <button
          type="submit"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-forest-800 px-5 text-sm font-semibold text-cream-50 disabled:opacity-50"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save name and phone"}
        </button>
        {saved ? <p className="text-sm text-forest-800">{saved}</p> : null}
      </form>
      <dl className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <Row label="Email" value={user?.email ?? profile?.email ?? "—"} />
        <Row label="Role" value={accountTypeLabel(account_type)} />
        <Row label="Status" value={accountStatusLabel(account_status)} />
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="font-semibold uppercase tracking-[0.14em] text-gold-700">Activation</dt>
          <dd className="min-w-0 break-words text-ink-900">
            {activation.text.replace(/^Activation: /, "")}
            {activation.showActivate ? (
              <>
                {" "}
                <Link to={SIGNUP_FEE_ACTIVATE_PATH} className="font-semibold text-forest-800 underline">
                  Activate
                </Link>
              </>
            ) : null}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-ink-500">
        {accountRoleNote(account_type)}
        {account_type === "CUSTOMER" && !hidePricing ? ` ${CUSTOMER_ACTIVATION_NOTE}` : ""}
        {account_type === "CUSTOMER" ? ` ${CUSTOMER_PAYS_DIRECTLY}` : ""}
      </p>
      <Link
        to={
          accountSettingsPath(account_type, account_status).startsWith("/app/")
            ? `${accountSettingsPath(account_type, account_status)}/notifications`
            : "/notifications"
        }
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-gold-500/50 bg-cream-100 px-5 text-sm font-semibold text-forest-800"
      >
        Notification settings
      </Link>
      {account_type === "CUSTOMER" ? (
        <Link
          to="/app/customer/account/blocked"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-gold-500/50 bg-cream-100 px-5 text-sm font-semibold text-forest-800"
        >
          Blocked pros
        </Link>
      ) : null}
      <FormError message={error} />
      <button
        type="button"
        className="inline-flex min-h-12 items-center justify-center rounded-full border border-forest-800/20 bg-cream-50 px-5 text-sm font-semibold text-forest-800"
        onClick={() => {
          void signOut().then(() => navigate("/", { replace: true }));
        }}
      >
        Sign out
      </button>
      <section className="mt-10 border-t border-forest-800/10 pt-10">
        <h2 className="text-sm font-semibold text-ink-500">Delete account</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Permanently close this account and remove your profile. This cannot be undone.
        </p>
        <button
          type="button"
          className="mt-4 min-h-11 text-left text-sm text-danger-600/70 underline-offset-4 hover:text-danger-600 hover:underline"
          onClick={() => {
            setError(null);
            setDeleteOpen(true);
          }}
        >
          Delete account
        </button>
      </section>
      <DeleteAccountDialog
        open={deleteOpen}
        busy={busy}
        error={error}
        onClose={() => {
          if (busy) return;
          setDeleteOpen(false);
          setError(null);
        }}
        onConfirm={() => {
          setBusy(true);
          setError(null);
          void deleteOwnAccount()
            .then(async (result) => {
              if (result.error) {
                setError(result.error);
                return;
              }
              await signOut();
              setDeleteOpen(false);
              navigate("/", { replace: true });
            })
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}

export function BlockedProsPage() {
  return (
    <div className="max-w-lg space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Settings</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Blocked pros</h1>
      </header>
      <p className="text-sm leading-relaxed text-ink-700">
        These pros will not be offered your future projects. A job already underway stays as it is. A paid connection stays paid.
      </p>
      <BlockedProsList />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="font-semibold uppercase tracking-[0.14em] text-gold-700">{label}</dt>
      <dd className="min-w-0 break-words text-ink-900">{value}</dd>
    </div>
  );
}
