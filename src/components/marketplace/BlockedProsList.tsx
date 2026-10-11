import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { listMyContractorBlocks, unblockContractorForCustomer } from "../../lib/marketplace/api";
import {
  blockedReasonLabel,
  parseBlockedContractors,
  type BlockedContractor,
} from "../../lib/marketplace/contractorBlocks";

export function BlockedProsList() {
  const [rows, setRows] = useState<BlockedContractor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<BlockedContractor | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    const data = await listMyContractorBlocks();
    setRows(parseBlockedContractors(data));
  }

  useEffect(() => {
    let stop = false;
    void load()
      .catch((err: Error) => {
        if (!stop) setError(err.message);
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-ink-500">Loading blocked pros</p>;

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
      {note ? <p className="text-sm text-forest-800">{note}</p> : null}
      {rows.length === 0 && !error ? (
        <p className="text-sm text-ink-700">You have not blocked any pros.</p>
      ) : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
            <p className="font-semibold text-forest-800">{row.displayLabel}</p>
            <p className="mt-1 text-sm text-ink-700">{blockedReasonLabel(row.reason)}</p>
            <Button type="button" variant="outline" className="mt-3 min-h-12 w-full" onClick={() => setPending(row)}>
              Unblock
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        title="Unblock this pro?"
        body="Future projects can include this pro again. Offers that were already closed stay closed. A job already underway stays as it is."
        confirmLabel="Unblock"
        cancelLabel="Keep blocked"
        busy={busy}
        onClose={() => {
          if (!busy) setPending(null);
        }}
        onConfirm={() => {
          if (!pending) return;
          const target = pending;
          setBusy(true);
          setError(null);
          void unblockContractorForCustomer(target.contractorProfileId)
            .then(() => load())
            .then(() => {
              setPending(null);
              setNote(`${target.displayLabel} can be offered your future projects.`);
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
