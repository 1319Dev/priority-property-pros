import { useState } from "react";
import { BlockContractorControl } from "./BlockContractorControl";
import { JobReference } from "./JobReference";
import { Button, ButtonLink } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { StatusBanner } from "../ui/StatusBanner";
import { StarRating } from "../../features/reviews/ReviewCard";
import { liveContractorPath } from "../../lib/marketplace/publicDirectory";
import {
  formatReviewPostedDate,
  reviewEditWindowNote,
  reviewIsEditable,
} from "../../lib/marketplace/reviewEdits";
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

function RatingPicker({
  rating,
  onChange,
}: {
  rating: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Rating">
      {["1", "2", "3", "4", "5"].map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={rating === value}
          className={`min-h-11 min-w-11 rounded-full px-3 text-sm font-semibold ${
            rating === value ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"
          }`}
          onClick={() => onChange(value)}
        >
          {value}
        </button>
      ))}
    </div>
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
  contractorProfileId = null,
  bookingId = null,
  now = Date.now(),
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
  onSubmit: (rating: string, body: string) => void | Promise<void>;
  contractorProfileId?: string | null;
  bookingId?: string | null;
  /** Test clock. Production callers leave this unset. */
  now?: number;
}) {
  const mine = reviews.find((review) => review.reviewer_role === ownReviewerRole(role));
  const visible = canSeeReviewCta({ mutuallyHired, bookingStatus });
  const canSubmit = canSubmitProfileReview({
    bookingStatus,
    mutuallyHired,
    alreadyReviewed: Boolean(mine),
    reviewerIsParticipant: true,
  });
  const [editing, setEditing] = useState(false);
  const [draftRating, setDraftRating] = useState(rating);
  const [draftBody, setDraftBody] = useState(body);
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  if (mine && editing) {
    return (
      <section className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4" aria-label="Edit your review">
        <h2 className="font-display text-2xl text-forest-800">Your review</h2>
        <JobReference value={referenceNumber} />
        <p className="text-sm text-ink-700">Update the stars or the text. The same checks apply as when you first posted it.</p>
        <RatingPicker rating={draftRating} onChange={setDraftRating} />
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Review</span>
          <textarea
            aria-label="Review"
            className="min-h-28 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
          />
        </label>
        <Button
          type="button"
          className="min-h-14 w-full"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void Promise.resolve(onSubmit(draftRating, draftBody))
              .then(() => setEditing(false))
              .catch(() => undefined)
              .finally(() => setSaving(false));
          }}
        >
          {saving ? "Saving…" : "Save review"}
        </Button>
        <Button type="button" variant="outline" className="min-h-14 w-full" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <CustomerBlockAction role={role} contractorProfileId={contractorProfileId} bookingId={bookingId} />
      </section>
    );
  }

  if (mine) {
    const editable = reviewIsEditable(mine.created_at, now);
    const posted = formatReviewPostedDate(mine.created_at);
    const edited = mine.edited_at ? formatReviewPostedDate(mine.edited_at) : "";
    return (
      <section className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4" aria-label="Your review">
        <h2 className="font-display text-2xl text-forest-800">Your review</h2>
        <JobReference value={referenceNumber} />
        <StarRating rating={mine.rating} />
        <p className="text-sm leading-relaxed text-ink-700">{mine.body?.trim() ? mine.body : "No written comment."}</p>
        <p className="text-sm text-ink-500">{posted}</p>
        {edited ? <p className="text-sm font-semibold text-forest-800">Edited {edited}</p> : null}
        <p className="text-sm text-ink-700">{reviewEditWindowNote(editable)}</p>
        {editable ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-14 w-full"
            onClick={() => {
              setDraftRating(String(mine.rating));
              setDraftBody(mine.body ?? "");
              setEditing(true);
            }}
          >
            Edit
          </Button>
        ) : null}
        <CustomerBlockAction role={role} contractorProfileId={contractorProfileId} bookingId={bookingId} />
      </section>
    );
  }

  if (!canSubmit) return null;

  return (
    <section className="space-y-3" aria-label="Leave a review">
      <h2 className="font-display text-2xl text-forest-800">Review {otherPartyLabel(role)}</h2>
      <JobReference value={referenceNumber} />
      <p className="text-sm text-ink-700">This is a profile review of the other party after mutual Hired. It is not a review of the Priority Property Pros marketplace.</p>
      <RatingPicker rating={rating} onChange={onRatingChange} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Review</span>
        <textarea
          aria-label="Review"
          className="min-h-28 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
        />
      </label>
      <Button type="button" className="min-h-14 w-full" onClick={() => void onSubmit(rating, body)}>
        Submit review
      </Button>
      <CustomerBlockAction role={role} contractorProfileId={contractorProfileId} bookingId={bookingId} />
    </section>
  );
}

function CustomerBlockAction({
  role,
  contractorProfileId,
  bookingId,
}: {
  role: HiredParty;
  contractorProfileId?: string | null;
  bookingId?: string | null;
}) {
  if (role !== "customer" || !contractorProfileId) return null;
  return <BlockContractorControl contractorProfileId={contractorProfileId} bookingId={bookingId} />;
}
