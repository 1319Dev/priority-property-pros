import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/Button";
import { useAuth } from "../../lib/auth/useAuth";
import {
  acceptCurrentAgreements,
  fetchLegalAcceptanceRequired,
  fetchMissingAgreements,
} from "../../lib/legal/acceptanceApi";
import type { LegalDocument } from "../../lib/legal/catalog";
import { legalPagesPublished } from "../../lib/legal/publish";

type LoadGaps = () => Promise<LegalDocument[] | null>;
type Accept = () => Promise<{ error: string | null }>;
type AcceptanceRequired = () => Promise<boolean>;

/**
 * Asks an existing account to accept the current agreement versions.
 * Shown only when the legal pages are published and legal_acceptance_required is on.
 * Rendered beside the account's own pages. It does not replace them, redirect,
 * or hide projects, messages, or bookings. If either check is off or cannot run,
 * nothing is shown.
 */
export function AgreementAcceptancePrompt({
  published = legalPagesPublished(),
  acceptanceRequired = fetchLegalAcceptanceRequired,
  load = fetchMissingAgreements,
  accept = acceptCurrentAgreements,
}: {
  published?: boolean;
  acceptanceRequired?: AcceptanceRequired;
  load?: LoadGaps;
  accept?: Accept;
}) {
  const { user } = useAuth();
  const [required, setRequired] = useState(false);
  const [gaps, setGaps] = useState<LegalDocument[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [ageAffirmed, setAgeAffirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!published || !user) {
      setRequired(false);
      setGaps(null);
      return;
    }
    let cancel = false;
    void acceptanceRequired()
      .then((on) => {
        if (cancel) return;
        setRequired(on);
        if (!on) {
          setGaps(null);
          return;
        }
        return load().then((rows) => {
          if (!cancel) setGaps(rows);
        });
      })
      .catch(() => {
        if (!cancel) {
          setRequired(false);
          setGaps(null);
        }
      });
    return () => {
      cancel = true;
    };
  }, [published, user, acceptanceRequired, load]);

  if (!published || !user || !required || !gaps || gaps.length === 0) return null;

  return (
    <section
      aria-label="Accept updated agreements"
      className="border-b border-gold-500/40 bg-gold-500/15 px-4 py-4 text-sm text-forest-950 sm:px-6"
    >
      <div className="mx-auto w-full max-w-6xl space-y-3">
        <h2 className="font-display text-xl font-semibold text-forest-800">Please accept the current agreements</h2>
        <p>
          A newer version is on file. You can keep viewing your projects, messages, bookings, and other account
          information, and you can delete your account. The product does not include an in-app export. Until you
          accept, new marketplace actions stay unavailable: posting a project, sending an estimate, sending a project
          message, or starting a connection. This does not delete anything.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {gaps.map((doc) => (
            <li key={doc.slug}>
              <Link to={doc.path} className="font-semibold text-forest-800 underline">
                {doc.title}
              </Link>{" "}
              (version {doc.version})
            </li>
          ))}
        </ul>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-forest-800"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>I agree to the agreements listed above.</span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-forest-800"
            checked={ageAffirmed}
            onChange={(event) => setAgeAffirmed(event.target.checked)}
          />
          <span>I affirm that I am 18 or older. This is an affirmation, not a verification of my age.</span>
        </label>
        {error ? <p className="text-red-800">{error}</p> : null}
        <Button
          type="button"
          disabled={!checked || !ageAffirmed || busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void accept().then(async (result) => {
              if (result.error) {
                setError(result.error);
                setBusy(false);
                return;
              }
              setChecked(false);
              setAgeAffirmed(false);
              setGaps(await load());
              setBusy(false);
            });
          }}
        >
          {busy ? "Saving…" : "Accept"}
        </Button>
      </div>
    </section>
  );
}
