import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  declineJobCancelLabel,
  declineJobConfirmLabel,
  declineJobTitle,
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
      title={declineJobTitle(connectionStatus)}
      body={endJobConfirmBody(connectionStatus)}
      confirmLabel={declineJobConfirmLabel(connectionStatus)}
      cancelLabel={declineJobCancelLabel(connectionStatus)}
      tone="danger"
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
