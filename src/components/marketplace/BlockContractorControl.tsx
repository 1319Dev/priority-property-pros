import { useState } from "react";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { blockContractorForCustomer } from "../../lib/marketplace/api";

export const BLOCK_CONTRACTOR_BUTTON = "Don't match me with this pro again";
export const BLOCK_CONTRACTOR_TITLE = "Don't match with this pro again?";
export const BLOCK_CONTRACTOR_BODY =
  "Future projects will skip this pro. A job already underway stays as it is. A paid connection stays paid. You can unblock them later in Blocked pros.";
export const BLOCK_CONTRACTOR_CONFIRM = "Don't match again";
export const BLOCK_CONTRACTOR_CANCEL = "Keep matching";
export const BLOCK_CONTRACTOR_DONE = "This pro will not be offered your future projects.";

export function BlockContractorControl({
  contractorProfileId,
  bookingId = null,
  estimateId = null,
  onBlocked,
}: {
  contractorProfileId: string;
  bookingId?: string | null;
  estimateId?: string | null;
  onBlocked?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return <p className="text-sm font-semibold text-forest-800">{BLOCK_CONTRACTOR_DONE}</p>;
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="min-h-14 w-full" onClick={() => setOpen(true)}>
        {BLOCK_CONTRACTOR_BUTTON}
      </Button>
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
      <ConfirmDialog
        open={open}
        title={BLOCK_CONTRACTOR_TITLE}
        body={BLOCK_CONTRACTOR_BODY}
        confirmLabel={BLOCK_CONTRACTOR_CONFIRM}
        cancelLabel={BLOCK_CONTRACTOR_CANCEL}
        busy={busy}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => {
          setBusy(true);
          setError(null);
          void blockContractorForCustomer({
            contractorProfileId,
            bookingId,
            estimateId,
          })
            .then(() => {
              setOpen(false);
              setDone(true);
              onBlocked?.();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
