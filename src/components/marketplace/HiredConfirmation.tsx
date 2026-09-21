import { useState } from "react";
import { Button, ButtonLink } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { TextInput } from "../ui/Input";
import { StatusBanner } from "../ui/StatusBanner";
import { liveContractorPath } from "../../lib/marketplace/publicDirectory";
import type { BookingReview, BookingStatus } from "../../lib/marketplace/types";
import {
  HIRED_BUTTON_LABEL,
  HIRED_CONFIRM_BODY,
  HIRED_CONFIRM_CANCEL,
  HIRED_CONFIRM_LABEL,
  HIRED_CONFIRM_TITLE,
  HIRED_MUTUAL_COPY,
  canConfirmHired,
  canSeeReviewCta,
  canSubmitProfileReview,
  idleHiredCopy,
  mutualHiredState,
  otherPartyLabel,
  ownReviewerRole,
  waitingForHiredCopy,
  type HiredParty,
} from "../../lib/marketplace/hired";

export function HiredConfirmationCard({
  role,
  bookingStatus,
  customerHiredAt,
  contractorHiredAt,
  contractorProfileId,
  busy = false,
  onConfirm,
}: {
  role: HiredParty;
  bookingStatus: BookingStatus;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
  contractorProfileId?: string | null;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const state = mutualHiredState({ bookingStatus, customerHiredAt, contractorHiredAt });
  const canClick = canConfirmHired({ bookingStatus, role, customerHiredAt, contractorHiredAt });
  const waiting = waitingForHiredCopy(state);
  const showProfile = role === "customer" && state === "hired" && contractorProfileId;

  if (state === "unavailable") return null;

  return (
    <section className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <h2 className="font-display text-2xl text-forest-800">{state === "hired" ? "Hired" : "Hired confirmation"}</h2>
      {state === "hired" ? <StatusBanner tone="success" title="Hired" body={HIRED_MUTUAL_COPY} /> : null}
      {waiting ? <StatusBanner tone="info" title={waiting} body="Profile reviews stay locked until both of you confirm Hired." /> : null}
      {state === "idle" ? <p className="text-sm leading-relaxed text-ink-700">{idleHiredCopy(role)}</p> : null}
      {canClick ? (
        <Button type="button" className="min-h-14 w-full" disabled={busy} onClick={() => setOpen(true)}>
          {HIRED_BUTTON_LABEL}
        </Button>
      ) : null}
      {showProfile ? (
        <ButtonLink to={liveContractorPath(contractorProfileId)} variant="outline" className="min-h-14 w-full">
          View pro profile
        </ButtonLink>
      ) : null}
      <ConfirmDialog
        open={open}
        title={HIRED_CONFIRM_TITLE}
        body={HIRED_CONFIRM_BODY}
        confirmLabel={HIRED_CONFIRM_LABEL}
        cancelLabel={HIRED_CONFIRM_CANCEL}
        tone="primary"
        busy={busy}
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      />
    </section>
  );
}

export function ProfileReviewForm({
  role,
  bookingStatus,
  mutuallyHired,
  reviews,
  rating,
  body,
  onRatingChange,
  onBodyChange,
  onSubmit,
}: {
  role: HiredParty;
  bookingStatus: BookingStatus;
  mutuallyHired: boolean;
  reviews: BookingReview[];
  rating: string;
  body: string;
  onRatingChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const mine = reviews.find((review) => review.reviewer_role === ownReviewerRole(role));
  const visible = canSeeReviewCta({ mutuallyHired, bookingStatus });
  const canSubmit = canSubmitProfileReview({
    bookingStatus,
    mutuallyHired,
    alreadyReviewed: Boolean(mine),
    reviewerIsParticipant: true,
  });

  if (!visible) return null;

  if (mine) {
    return <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm">Your review of {otherPartyLabel(role)} is saved · {mine.rating} / 5</p>;
  }

  if (!canSubmit) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl text-forest-800">Review {otherPartyLabel(role)}</h2>
      <p className="text-sm text-ink-700">This is a profile review of the other party after mutual Hired. It is not a review of the Priority Property Pros marketplace.</p>
      <TextInput label="Rating (1–5)" inputMode="numeric" value={rating} onChange={(e) => onRatingChange(e.target.value)} />
      <textarea className="w-full rounded-2xl border border-forest-800/15 px-4 py-3" value={body} onChange={(e) => onBodyChange(e.target.value)} />
      <Button type="button" className="min-h-14 w-full" onClick={onSubmit}>
        Submit review
      </Button>
    </section>
  );
}
