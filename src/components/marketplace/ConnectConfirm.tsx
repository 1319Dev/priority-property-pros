import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  CONNECT_CHECKOUT_CONFIRM_EXTRA,
  CONNECT_CONFIRM_BODY,
  CONNECT_CONFIRM_TITLE,
  CONNECTION_FEE_NO_GUARANTEE,
} from "../../lib/marketplace/connectionLifecycle";

export function ConnectConfirmDialog({
  open,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title={CONNECT_CONFIRM_TITLE}
      body={`${CONNECT_CONFIRM_BODY} ${CONNECTION_FEE_NO_GUARANTEE} ${CONNECT_CHECKOUT_CONFIRM_EXTRA}`}
      confirmLabel="Connect — $4.99"
      cancelLabel="Not now"
      tone="primary"
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
