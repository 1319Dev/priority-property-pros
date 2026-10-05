import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { FormError } from "../../lib/auth/AuthCard";
import {
  getSharedProjectContact,
  shareProjectContact,
} from "../../lib/marketplace/contactShareApi";
import {
  SHARE_CONTACT_BUTTON_LABEL,
  SHARE_CONTACT_CONFIRM_BODY,
  SHARE_CONTACT_CONFIRM_TITLE,
  SHARE_CONTACT_COPY,
  SHARE_CONTACT_DONE_BODY,
  SHARE_CONTACT_DONE_TITLE,
  SHARE_CONTACT_WAITING_COPY,
  contractorMaySeeSharedContact,
  formatSharedAddress,
  sanitizeSharedContact,
  shareButtonVisible,
  type ContactShareAudience,
  type SharedContactView,
} from "../../lib/marketplace/contactShare";

const POLL_MS = 12_000;

function ContactLines({ view }: { view: SharedContactView }) {
  const address = formatSharedAddress(view);
  return (
    <dl className="mt-3 space-y-2">
      <div>
        <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Name</dt>
        <dd className="mt-1 font-semibold text-forest-800">{view.name || "Not on file"}</dd>
      </div>
      <div>
        <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Phone</dt>
        <dd className="mt-1 font-semibold text-forest-800">{view.phone || "Not on file"}</dd>
      </div>
      <div>
        <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Email</dt>
        <dd className="mt-1 font-semibold text-forest-800">{view.email || "Not on file"}</dd>
      </div>
      <div>
        <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Address</dt>
        <dd className="mt-1 font-semibold text-forest-800">{address || "Not on file"}</dd>
      </div>
    </dl>
  );
}

export function ContactSharePanel({
  role,
  projectId,
  contractorProfileId,
}: {
  role: ContactShareAudience;
  projectId: string;
  contractorProfileId: string;
}) {
  const [view, setView] = useState<SharedContactView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next = sanitizeSharedContact(
      await getSharedProjectContact(projectId, contractorProfileId, role),
      role,
    );
    setView(next);
  }, [projectId, contractorProfileId, role]);

  useEffect(() => {
    let stop = false;
    void load().catch((err: Error) => {
      if (!stop) setError(err.message);
    });
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [load]);

  if (!view?.eligible) return null;

  const showButton = role === "customer" && shareButtonVisible(view);
  const showShared = role === "customer" ? view.customer_shared : contractorMaySeeSharedContact(view);

  async function onShare() {
    setBusy(true);
    setError(null);
    try {
      const next = sanitizeSharedContact(await shareProjectContact(projectId, contractorProfileId), "customer");
      setView(next);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share contact.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm" aria-label="Share contact">
      <h2 className="font-display text-2xl text-forest-800">
        {showShared ? SHARE_CONTACT_DONE_TITLE : "Contact & address"}
      </h2>
      {showButton ? <p className="mt-3 leading-relaxed text-ink-700">{SHARE_CONTACT_COPY}</p> : null}
      {showShared ? <p className="mt-3 leading-relaxed text-ink-700">{SHARE_CONTACT_DONE_BODY}</p> : null}
      {role === "contractor" && !showShared ? (
        <p className="mt-3 leading-relaxed text-ink-700">{SHARE_CONTACT_WAITING_COPY}</p>
      ) : null}
      {showButton || showShared ? <ContactLines view={view} /> : null}
      <FormError message={error} />
      {showButton ? (
        <Button type="button" className="mt-4 min-h-14 w-full" onClick={() => setConfirmOpen(true)}>
          {SHARE_CONTACT_BUTTON_LABEL}
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={SHARE_CONTACT_CONFIRM_TITLE}
        body={SHARE_CONTACT_CONFIRM_BODY}
        confirmLabel="Share with this contractor"
        cancelLabel="Don't share"
        tone="primary"
        busy={busy}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void onShare()}
      />
    </section>
  );
}
