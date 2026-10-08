import { useState } from "react";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/Input";
import { FormError } from "../../lib/auth/AuthCard";
import {
  CHANGE_ORDER_ACK_ERROR,
  CHANGE_ORDER_APPROVE_ERROR,
  CHANGE_ORDER_REJECT_ERROR,
  CHANGE_ORDER_SAVE_ERROR,
  validateChangeOrderDraft,
} from "../../lib/marketplace/changeOrders";
import { formatUsdFromCents } from "../../lib/marketplace/fees";
import type { ChangeOrder } from "../../lib/marketplace/types";

export function ChangeOrderPanel({
  role,
  orders,
  onPropose,
  onRespond,
}: {
  role: "customer" | "contractor";
  orders: ChangeOrder[];
  onPropose: (description: string, amountDeltaCents: number) => Promise<void>;
  onRespond: (changeOrderId: string, approve: boolean) => Promise<void>;
}) {
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBanner(null);
    const draft = validateChangeOrderDraft(delta, note);
    if (!draft.ok) {
      setAmountError(draft.amountError);
      setDescriptionError(draft.descriptionError);
      return;
    }
    setAmountError(null);
    setDescriptionError(null);
    setBusy(true);
    try {
      await onPropose(draft.description, draft.cents);
      setDelta("");
      setNote("");
      setBanner(null);
    } catch {
      setBanner(CHANGE_ORDER_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function respond(changeOrderId: string, approve: boolean) {
    setBanner(null);
    setBusy(true);
    try {
      await onRespond(changeOrderId, approve);
      setBanner(null);
    } catch {
      setBanner(
        approve ? (role === "contractor" ? CHANGE_ORDER_ACK_ERROR : CHANGE_ORDER_APPROVE_ERROR) : CHANGE_ORDER_REJECT_ERROR,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl text-forest-800">Change orders</h2>
      <p className="text-sm text-ink-700">
        {role === "contractor"
          ? "You cannot raise the price by yourself. The customer has to approve."
          : "The pro cannot raise the price alone. You both have to agree."}
      </p>
      <FormError message={banner} />
      <ul className="space-y-2 text-sm">
        {orders.map((order) => (
          <li key={order.id} className="rounded-2xl border border-forest-800/10 bg-cream-100 px-4 py-3">
            <p className="font-semibold">
              {formatUsdFromCents(order.amount_delta_cents)} · {order.status.replaceAll("_", " ")}
            </p>
            <p>{order.description}</p>
            {role === "contractor" && order.status === "CUSTOMER_APPROVED" && !order.contractor_acked_at ? (
              <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => void respond(order.id, true)}>
                Acknowledge
              </Button>
            ) : null}
            {role === "customer" && order.status === "PROPOSED" ? (
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={() => void respond(order.id, true)}>
                  Approve
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void respond(order.id, false)}>
                  Decline
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <TextInput
        label="Change amount (USD, + or −)"
        value={delta}
        onChange={(e) => {
          setDelta(e.target.value);
          setAmountError(null);
          setBanner(null);
        }}
      />
      {amountError ? <p className="text-sm text-danger-600">{amountError}</p> : null}
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">What changed</span>
        <textarea
          aria-label="What changed"
          className="w-full rounded-2xl border border-forest-800/15 px-4 py-3"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setDescriptionError(null);
            setBanner(null);
          }}
        />
      </label>
      {descriptionError ? <p className="text-sm text-danger-600">{descriptionError}</p> : null}
      <Button type="button" variant="outline" className="min-h-14 w-full" disabled={busy} onClick={() => void submit()}>
        Propose a change
      </Button>
    </section>
  );
}
