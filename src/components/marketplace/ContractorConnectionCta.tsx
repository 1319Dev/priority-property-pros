import { Button } from "../ui/Button";
import { StatusBanner } from "../ui/StatusBanner";
import {
  CHECKOUT_PENDING_COPY,
  CONNECT_BUTTON_LABEL,
  CONNECT_PAYMENTS_OFF_COPY,
  CONNECTED_BODY,
  CONNECTED_LABEL,
  showConnectButton,
  type ContractorConnectionUiState,
} from "../../lib/marketplace/connectionLifecycle";

export function ContractorConnectionCta({
  state,
  busy,
  onConnect,
}: {
  state: ContractorConnectionUiState;
  busy?: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[390px] flex-col gap-3">
      {state === "connected" ? <StatusBanner tone="success" title={CONNECTED_LABEL} body={CONNECTED_BODY} /> : null}
      {state === "checkout_pending" ? (
        <StatusBanner tone="info" title="Checkout in progress" body={CHECKOUT_PENDING_COPY} />
      ) : null}
      {state === "requested" ? (
        <StatusBanner tone="info" title="Connection requested" body={CONNECT_PAYMENTS_OFF_COPY} />
      ) : null}
      {showConnectButton(state) ? (
        <Button type="button" className="min-h-14 w-full" disabled={busy} onClick={onConnect}>
          {CONNECT_BUTTON_LABEL}
        </Button>
      ) : null}
    </div>
  );
}
