import { CheckoutRefundNotice } from "../payments/CheckoutRefundNotice";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  CONNECT_CHECKOUT_CONFIRM_EXTRA,
  CONNECT_CONFIRM_BODY,
  CONNECT_CONFIRM_TITLE,
} from "../../lib/marketplace/connectionLifecycle";
import { CONNECTION_FEE_NON_REFUNDABLE } from "../../data/pricing";

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
      body={`${CONNECT_CONFIRM_BODY} ${CONNECT_CHECKOUT_CONFIRM_EXTRA} ${CONNECTION_FEE_NON_REFUNDABLE}`}
      confirmLabel="Connect — $4.99"
      cancelLabel="Not now"
      tone="primary"
      busy={busy}
      notice={<CheckoutRefundNotice fee="connection" />}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
