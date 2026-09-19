import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  END_JOB_CANCEL,
  END_JOB_CONFIRM,
  END_JOB_TITLE,
  endJobConfirmBody,
} from "../../lib/marketplace/contractorJobActions";
import type { ProjectConnectionStatus } from "../../lib/marketplace/types";

export function EndJobDialog({
  open,
  busy,
  connectionStatus,
  onConfirm,
  onClose,
}: {
  open: boolean;
  busy?: boolean;
  connectionStatus?: ProjectConnectionStatus | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title={END_JOB_TITLE}
      body={endJobConfirmBody(connectionStatus)}
      confirmLabel={END_JOB_CONFIRM}
      cancelLabel={END_JOB_CANCEL}
      tone="danger"
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
