import { useState } from "react";
import { JobReference } from "./JobReference";
import { Button, ButtonLink } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
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
      <h2 className="font-display text-2xl text-forest-800">{state === "hired" ? "You're working together" : "Confirm hired"}</h2>
      {state === "hired" ? <p className="text-sm leading-relaxed text-ink-700">{HIRED_MUTUAL_COPY}</p> : null}
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
  referenceNumber,
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
  referenceNumber?: number | string | null;
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
    return (
      <div className="rounded-3xl bg-cream-100 px-5 py-4 text-sm">
        <p>Your review of {otherPartyLabel(role)} is saved · {mine.rating} / 5</p>
        <JobReference value={referenceNumber} />
      </div>
    );
  }

  if (!canSubmit) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl text-forest-800">Review {otherPartyLabel(role)}</h2>
      <JobReference value={referenceNumber} />
      <p className="text-sm text-ink-700">This is a profile review of the other party after mutual Hired. It is not a review of the Priority Property Pros marketplace.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Rating">
        {["1", "2", "3", "4", "5"].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={rating === value}
            className={`min-h-11 min-w-11 rounded-full px-3 text-sm font-semibold ${
              rating === value ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"
            }`}
            onClick={() => onRatingChange(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Review</span>
        <textarea
          aria-label="Review"
          className="w-full rounded-2xl border border-forest-800/15 px-4 py-3"
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
        />
      </label>
      <Button type="button" className="min-h-14 w-full" onClick={onSubmit}>
        Submit review
      </Button>
    </section>
  );
}
