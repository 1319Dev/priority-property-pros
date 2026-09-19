import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ButtonLink } from "../../../components/ui/Button";
import { ErrorState, LoadingState } from "../../../components/ui/PageState";
import { reconcileConnectionCheckout } from "../../../lib/marketplace/api";
import { successUrlUnlocksContact } from "../../../lib/marketplace/connectionCheckout";
import { CONNECTION_FEE_NON_REFUNDABLE } from "../../../data/pricing";
import { CONNECT_DOES_NOT_UNLOCK_COPY } from "../../../lib/marketplace/connectionLifecycle";

export function ConnectionCheckoutReturnPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [message, setMessage] = useState(
    `Confirming your $4.99 payment. This page cannot unlock contact. ${CONNECTION_FEE_NON_REFUNDABLE}`,
  );
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (successUrlUnlocksContact(params)) {
      setUnlocked(false);
    }
    if (!sessionId) {
      setMessage(CONNECT_DOES_NOT_UNLOCK_COPY);
      setBusy(false);
      return;
    }
    void reconcileConnectionCheckout(sessionId)
      .then((result) => {
        const granted = result.contact_unlocked === true;
        setUnlocked(granted);
        setMessage(
          granted
            ? `Payment verified. Connection access is unlocked for this project. ${CONNECTION_FEE_NON_REFUNDABLE}`
            : `Payment is still being verified, or it was not completed. Contact stays locked until the server confirms a $4.99 Connection Fee. ${CONNECTION_FEE_NON_REFUNDABLE}`,
        );
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }, [params, sessionId]);

  if (busy) return <LoadingState label="Verifying payment" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 py-8">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Connection Fee</p>
      <h1 className="font-display text-3xl font-semibold text-forest-800">
        {unlocked ? "Connected" : "Contact still locked"}
      </h1>
      <p className="text-sm leading-relaxed text-ink-700">{message}</p>
      <p className="text-sm leading-relaxed text-ink-500">{CONNECTION_FEE_NON_REFUNDABLE}</p>
      <p className="text-sm leading-relaxed text-ink-500">{CONNECT_DOES_NOT_UNLOCK_COPY}</p>
      <ButtonLink to="/app/pro/opportunities" className="min-h-14 w-full">
        Back to opportunities
      </ButtonLink>
      <Link to="/app/pro" className="text-center text-sm text-forest-800 underline">
        Pro home
      </Link>
    </div>
  );
}
