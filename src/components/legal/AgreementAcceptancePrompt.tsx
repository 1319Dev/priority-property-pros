import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/Button";
import { useAuth } from "../../lib/auth/useAuth";
import { acceptCurrentAgreements, fetchMissingAgreements } from "../../lib/legal/acceptanceApi";
import type { LegalDocument } from "../../lib/legal/catalog";
import { legalPagesPublished } from "../../lib/legal/publish";

type LoadGaps = () => Promise<LegalDocument[] | null>;
type Accept = () => Promise<{ error: string | null }>;

/**
 * Asks an existing account to accept the current agreement versions.
 * Rendered beside the account's own pages. It does not replace them and it
 * does not redirect. If the check cannot run, nothing is shown.
 */
export function AgreementAcceptancePrompt({
  published = legalPagesPublished(),
  load = fetchMissingAgreements,
  accept = acceptCurrentAgreements,
}: {
  published?: boolean;
  load?: LoadGaps;
  accept?: Accept;
}) {
  const { user } = useAuth();
  const [gaps, setGaps] = useState<LegalDocument[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!published || !user) {
      setGaps(null);
      return;
    }
    let cancel = false;
    void load().then((rows) => {
      if (!cancel) setGaps(rows);
    });
    return () => {
      cancel = true;
    };
  }, [published, user, load]);

  if (!published || !user || !gaps || gaps.length === 0) return null;

  return (
    <section
      aria-label="Accept updated agreements"
      className="border-b border-gold-500/40 bg-gold-500/15 px-4 py-4 text-sm text-forest-950 sm:px-6"
    >
      <div className="mx-auto w-full max-w-6xl space-y-3">
        <h2 className="font-display text-xl font-semibold text-forest-800">Please accept the current agreements</h2>
        <p>
          A newer version is on file. You can keep viewing your projects, messages, bookings, and other account data
          before you accept. This does not lock your account.
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
        {error ? <p className="text-red-800">{error}</p> : null}
        <Button
          type="button"
          disabled={!checked || busy}
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
