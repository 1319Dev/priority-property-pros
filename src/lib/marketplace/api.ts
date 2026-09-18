import { getSupabaseClient } from "../supabase/client";
import type { Database, Json } from "../supabase/database.types";
import { assertNoPreHireContact } from "./antiCircumvention";
import { looksLikeFilename } from "./publicDirectory";
import { isAllowedContractorDoc, isAllowedImage, sanitizeUploadName } from "./privacy";
import { reusableEmptyDraft } from "./flows";
import { detectContactLeak } from "./contactLeak";
import type {
  BookingContactAccess,
  Project,
  ProjectPrivateLocation,
  QuestionKind,
  ServiceAreaMode,
  ServiceCategory,
  ServiceQuestion,
  TimingPreference,
} from "./types";

export type RpcJson = Record<string, unknown>;

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("The marketplace is not connected yet.");
  return supabase;
}

function asError(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

function rejectContactLeak(text: string | null | undefined) {
  const leak = detectContactLeak(text);
  if (leak.blocked) throw new Error(leak.message ?? "Contact info is shared after connection through Priority Property Pros.");
  assertNoPreHireContact(text);
}

export function parseQuestionOptions(value: Json | string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const options: string[] = [];
  for (const item of value) {
    if (typeof item === "string") options.push(item);
  }
  return options;
}

export async function fetchServiceCategories(): Promise<ServiceCategory[]> {
  const { data, error } = await client()
    .from("service_categories")
    .select("id, slug, name, blurb, sort_order, is_active, is_regulated, requires_verified_credential")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(asError(error, "Could not load categories."));
  return (data ?? []) as ServiceCategory[];
}

export async function fetchServiceQuestions(categoryId: string): Promise<ServiceQuestion[]> {
  const { data, error } = await client()
    .from("service_questions")
    .select("id, category_id, prompt, help_text, kind, options, is_required, sort_order, is_active")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(asError(error, "Could not load questions."));
  return (data ?? []).map((row) => ({
    ...row,
    kind: row.kind as QuestionKind,
    options: parseQuestionOptions(row.options),
  }));
}

export async function createDraftProject(customerId: string): Promise<Project> {
  const { data, error } = await client()
    .from("projects")
    .insert({ customer_id: customerId, title: "", description: "", status: "DRAFT" })
    .select()
    .single();
  if (error || !data) throw new Error(asError(error, "Could not create a draft."));
  return data as Project;
}

export async function createOrReuseDraftProject(customerId: string): Promise<Project> {
  const existing = await fetchCustomerProjects(customerId);
  const reusable = reusableEmptyDraft(existing);
  if (reusable) return reusable;
  return createDraftProject(customerId);
}

export async function fetchCustomerProjects(customerId?: string): Promise<Project[]> {
  void customerId;
  const { data, error } = await client().rpc("list_my_customer_projects");
  if (error) {
    const fallback = await client()
      .from("projects")
      .select(
        "id, customer_id, category_id, title, description, status, completeness, city, state, zip_code, timing, preferred_date, budget_min_cents, budget_max_cents, draft_step, selected_contractor_profile_id, selected_estimate_id, selected_booking_id, posted_at, selected_at, scope_revision, cancelled_at, cancel_reason, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (fallback.error) throw new Error(asError(error, "Could not load projects."));
    return (fallback.data ?? []) as Project[];
  }
  return (Array.isArray(data) ? data : []) as Project[];
}

export async function fetchMyCustomerProject(id: string): Promise<Project> {
  const { data, error } = await client().rpc("get_my_customer_project", { p_project_id: id });
  const row = Array.isArray(data) ? data[0] : data;
  if (!error && row) return row as Project;
  const fallback = await client().from("projects").select("*").eq("id", id).maybeSingle();
  if (fallback.error || !fallback.data) throw new Error("Project not found.");
  return fallback.data as Project;
}

export async function fetchProject(id: string): Promise<Project> {
  const { data, error } = await client().from("projects").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new Error(asError(error, "Project not found."));
  return data as Project;
}

export async function updateProject(
  id: string,
  patch: Database["public"]["Tables"]["projects"]["Update"] & { draft_step?: number },
): Promise<Project> {
  if (patch.title !== undefined) rejectContactLeak(patch.title);
  if (patch.description !== undefined) rejectContactLeak(patch.description);
  const { data, error } = await client().from("projects").update(patch).eq("id", id).select().single();
  if (error || !data) throw new Error(asError(error, "Could not save the project."));
  return data as Project;
}

export async function upsertPrivateLocation(
  projectId: string,
  location: Omit<ProjectPrivateLocation, "project_id">,
): Promise<void> {
  const { error } = await client().from("project_private_locations").upsert({
    project_id: projectId,
    ...location,
  });
  if (error) throw new Error(asError(error, "Could not save the address."));
}

export async function fetchPrivateLocation(projectId: string): Promise<ProjectPrivateLocation | null> {
  const { data, error } = await client()
    .from("project_private_locations")
    .select("project_id, street_line1, street_line2, lat, lng")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(asError(error, "Could not load the address."));
  return data;
}

export async function fetchProjectPhotos(projectId: string) {
  const { data, error } = await client()
    .from("project_photos")
    .select("id, project_id, storage_path, sort_order")
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw new Error(asError(error, "Could not load photos."));
  return data ?? [];
}

export async function fetchProjectAnswers(projectId: string) {
  const { data, error } = await client()
    .from("project_answers")
    .select("id, project_id, question_id, answer_text, answer_json")
    .eq("project_id", projectId);
  if (error) throw new Error(asError(error, "Could not load answers."));
  return data ?? [];
}

export async function upsertProjectAnswer(projectId: string, questionId: string, answerText: string) {
  rejectContactLeak(answerText);
  const { error } = await client().from("project_answers").upsert(
    { project_id: projectId, question_id: questionId, answer_text: answerText },
    { onConflict: "project_id,question_id" },
  );
  if (error) throw new Error(asError(error, "Could not save the answer."));
}

export async function uploadProjectPhoto(params: {
  userId: string;
  projectId: string;
  file: File;
  sortOrder: number;
}) {
  if (!isAllowedImage(params.file.type)) throw new Error("Use a JPEG, PNG, or WebP photo.");
  if (params.file.size > 10 * 1024 * 1024) throw new Error("Photos must be 10 MB or smaller.");
  const path = `${params.userId}/${params.projectId}/${crypto.randomUUID()}-${sanitizeUploadName(params.file.name)}`;
  const supabase = client();
  const { error: uploadError } = await supabase.storage.from("project-photos").upload(path, params.file, {
    contentType: params.file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase.from("project_photos").insert({
    project_id: params.projectId,
    storage_path: path,
    sort_order: params.sortOrder,
  });
  if (error) throw new Error(asError(error, "Could not attach the photo."));
}

export async function deleteProjectPhoto(id: string, storagePath: string) {
  const supabase = client();
  await supabase.storage.from("project-photos").remove([storagePath]);
  const { error } = await supabase.from("project_photos").delete().eq("id", id);
  if (error) throw new Error(asError(error, "Could not remove the photo."));
}

export async function signedProjectPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await client().storage.from("project-photos").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function postProject(projectId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("post_project", { p_project_id: projectId });
  if (error) throw new Error(asError(error, "Could not post the project."));
  return (data ?? {}) as RpcJson;
}

export async function updateCustomerProject(projectId: string, patch: Record<string, unknown>): Promise<RpcJson> {
  if (typeof patch.title === "string") rejectContactLeak(patch.title);
  if (typeof patch.description === "string") rejectContactLeak(patch.description);
  const { data, error } = await client().rpc("update_customer_project", {
    p_project_id: projectId,
    p_patch: patch as Json,
  });
  if (error) throw new Error(asError(error, "Could not save the project."));
  return (data ?? {}) as RpcJson;
}

export async function cancelCustomerProject(projectId: string, confirm = false): Promise<RpcJson> {
  const { data, error } = await client().rpc("cancel_customer_project", {
    p_project_id: projectId,
    p_confirm: confirm,
  });
  if (error) throw new Error(asError(error, "Could not update the project."));
  return (data ?? {}) as RpcJson;
}

export async function fetchProjectNotices(projectId: string) {
  const { data, error } = await client()
    .from("project_notices")
    .select("id, project_id, audience, kind, title, body, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw new Error(asError(error, "Could not load updates."));
  return data ?? [];
}

export async function acceptOpportunity(opportunityId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("accept_opportunity", { p_opportunity_id: opportunityId });
  if (error) throw new Error(asError(error, "Could not accept this opportunity."));
  return (data ?? {}) as RpcJson;
}

export async function passOpportunity(opportunityId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("pass_opportunity", { p_opportunity_id: opportunityId });
  if (error) throw new Error(asError(error, "Could not pass on this opportunity."));
  return (data ?? {}) as RpcJson;
}

export async function submitEstimate(estimateId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("submit_estimate", { p_estimate_id: estimateId });
  if (error) throw new Error(asError(error, "Could not submit the estimate."));
  return (data ?? {}) as RpcJson;
}

export async function withdrawEstimate(estimateId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("withdraw_estimate", { p_estimate_id: estimateId });
  if (error) throw new Error(asError(error, "Could not withdraw the estimate."));
  return (data ?? {}) as RpcJson;
}

export async function selectEstimate(projectId: string, estimateId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("select_estimate", {
    p_project_id: projectId,
    p_estimate_id: estimateId,
  });
  if (error) throw new Error(asError(error, "Could not select this contractor."));
  return (data ?? {}) as RpcJson;
}

export async function markEstimateViewed(estimateId: string, projectId?: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("mark_estimate_viewed", {
    p_estimate_id: estimateId,
    p_project_id: projectId ?? null,
  });
  if (error) throw new Error(asError(error, "Could not open the estimate."));
  return (data ?? {}) as RpcJson;
}

export async function declineEstimate(estimateId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("decline_estimate", { p_estimate_id: estimateId });
  if (error) throw new Error(asError(error, "Could not decline this estimate."));
  return (data ?? {}) as RpcJson;
}

export type ContractorEstimateListItem = {
  id: string;
  project_id: string;
  opportunity_id: string;
  project_title: string;
  status: string;
  total_cents: number;
  submitted_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  withdrawn_at: string | null;
  created_at: string;
};

export async function fetchMyEstimates(): Promise<ContractorEstimateListItem[]> {
  const { data, error } = await client().rpc("list_my_estimates");
  if (error) throw new Error(asError(error, "Could not load your estimates."));
  return Array.isArray(data) ? (data as ContractorEstimateListItem[]) : [];
}

export type InAppNotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  channel: "in_app";
  read_at: string | null;
  created_at: string;
};

export async function fetchMyNotifications(): Promise<InAppNotificationRow[]> {
  const { data, error } = await client().rpc("list_my_notifications");
  if (error) throw new Error(asError(error, "Could not load notifications."));
  return Array.isArray(data) ? (data as InAppNotificationRow[]) : [];
}

export async function markNotificationRead(id: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("mark_notification_read", { p_notification_id: id });
  if (error) throw new Error(asError(error, "Could not mark the notification read."));
  return (data ?? {}) as RpcJson;
}

export async function fetchFeePreview(totalCents: number) {
  const { data, error } = await client().rpc("fee_preview", { p_total_cents: totalCents });
  if (error) throw new Error(asError(error, "Could not load the fee preview."));
  return data as RpcJson;
}

export async function fetchMarketplaceFeePreview(amountCents: number, kind: "ORIGINAL" | "REPEAT" = "ORIGINAL") {
  const { data, error } = await client().rpc("preview_marketplace_fee", {
    p_amount_cents: amountCents,
    p_kind: kind,
  });
  if (error) throw new Error(asError(error, "Could not load the booking fee preview."));
  return data as RpcJson;
}

export async function fetchProtectionMonths(): Promise<number> {
  const { data, error } = await client().rpc("relationship_protection_months");
  if (error) throw new Error(asError(error, "Could not load protection months."));
  return Number(data ?? 12);
}

export async function fetchMyBookings(role: "customer" | "contractor", id: string) {
  const column = role === "customer" ? "customer_id" : "contractor_profile_id";
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq(column, id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(asError(error, "Could not load bookings."));
  return data ?? [];
}

export async function fetchBooking(id: string) {
  const { data, error } = await client().from("bookings").select("*").eq("id", id).single();
  if (error || !data) throw new Error(asError(error, "Booking not found."));
  return data;
}

export async function fetchChangeOrders(bookingId: string) {
  const { data, error } = await client()
    .from("change_orders")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(asError(error, "Could not load change orders."));
  return data ?? [];
}

export async function fetchBookingReviews(bookingId: string) {
  const { data, error } = await client()
    .from("booking_reviews")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(asError(error, "Could not load reviews."));
  return data ?? [];
}

export async function fetchBookingReview(bookingId: string) {
  const rows = await fetchBookingReviews(bookingId);
  return rows[0] ?? null;
}

export async function fetchBookingEvents(bookingId: string) {
  const { data, error } = await client()
    .from("booking_events")
    .select("id, event_type, payload, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(asError(error, "Could not load booking history."));
  return data ?? [];
}

export async function cancelPendingBooking(bookingId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("cancel_pending_booking", { p_booking_id: bookingId });
  if (error) throw new Error(asError(error, "Could not cancel the booking."));
  return (data ?? {}) as RpcJson;
}

export async function startBooking(bookingId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("start_booking", { p_booking_id: bookingId });
  if (error) throw new Error(asError(error, "Could not start the job."));
  return (data ?? {}) as RpcJson;
}

export async function completeBooking(bookingId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("complete_booking", { p_booking_id: bookingId });
  if (error) throw new Error(asError(error, "Could not mark the job complete."));
  return (data ?? {}) as RpcJson;
}

export async function disputeBooking(bookingId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("dispute_booking", { p_booking_id: bookingId });
  if (error) throw new Error(asError(error, "Could not open a dispute."));
  return (data ?? {}) as RpcJson;
}

export async function confirmBookingForTesting(bookingId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("confirm_booking_for_testing", { p_booking_id: bookingId });
  if (error) throw new Error(asError(error, "Testing confirmation failed."));
  return (data ?? {}) as RpcJson;
}

export async function proposeChangeOrder(bookingId: string, description: string, amountDeltaCents: number): Promise<RpcJson> {
  const { data, error } = await client().rpc("propose_change_order", {
    p_booking_id: bookingId,
    p_description: description,
    p_amount_delta_cents: amountDeltaCents,
  });
  if (error) throw new Error(asError(error, "Could not propose the change."));
  return (data ?? {}) as RpcJson;
}

export async function respondChangeOrder(changeOrderId: string, approve: boolean): Promise<RpcJson> {
  const { data, error } = await client().rpc("respond_change_order", {
    p_change_order_id: changeOrderId,
    p_approve: approve,
  });
  if (error) throw new Error(asError(error, "Could not respond to the change order."));
  return (data ?? {}) as RpcJson;
}

export async function submitBookingReview(bookingId: string, rating: number, body?: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("submit_booking_review", {
    p_booking_id: bookingId,
    p_rating: rating,
    p_body: body ?? null,
  });
  if (error) throw new Error(asError(error, "Could not save the review."));
  return (data ?? {}) as RpcJson;
}

export async function fetchBookingJobContact(bookingId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("booking_job_contact", { p_booking_id: bookingId });
  if (error) throw new Error(asError(error, "Contact is still locked."));
  return (data ?? {}) as RpcJson;
}

export async function fetchBookingContactAccess(bookingId: string): Promise<BookingContactAccess | null> {
  const { data, error } = await client()
    .from("booking_contact_access")
    .select(
      "booking_id, status, granted_at, granted_by, grant_reason, grant_source, revoked_at, created_at, updated_at",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw new Error(asError(error, "Could not load contact access."));
  return (data as BookingContactAccess | null) ?? null;
}

export async function adminGrantBookingContactAccess(bookingId: string, reason: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("admin_grant_booking_contact_access", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw new Error(asError(error, "Could not grant contact access."));
  return (data ?? {}) as RpcJson;
}

export async function adminRevokeBookingContactAccess(bookingId: string, reason: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("admin_revoke_booking_contact_access", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw new Error(asError(error, "Could not revoke contact access."));
  return (data ?? {}) as RpcJson;
}

export async function fetchHireAgainContractors(): Promise<RpcJson[]> {
  const { data, error } = await client().rpc("hire_again_contractors");
  if (error) throw new Error(asError(error, "Could not load Hire Again."));
  return (Array.isArray(data) ? data : []) as RpcJson[];
}

export async function expireStalePendingBookings(): Promise<number> {
  const { data, error } = await client().rpc("expire_stale_pending_bookings");
  if (error) throw new Error(asError(error, "Could not refresh expired bookings."));
  return Number(data ?? 0);
}

export type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"] & {
  projects?: Pick<
    Project,
    | "id"
    | "title"
    | "description"
    | "city"
    | "state"
    | "zip_code"
    | "timing"
    | "budget_min_cents"
    | "budget_max_cents"
    | "status"
    | "completeness"
    | "category_id"
    | "preferred_date"
  > | null;
};

async function attachProject<T extends { project_id: string }>(row: T): Promise<T & { projects: OpportunityRow["projects"] }> {
  const project = await fetchProject(row.project_id);
  return { ...row, projects: project };
}

export async function fetchMyOpportunities(contractorProfileId: string) {
  const { data, error } = await client()
    .from("opportunities")
    .select("id, project_id, contractor_profile_id, match_id, status, available_at, responded_at, expires_at, created_at")
    .eq("contractor_profile_id", contractorProfileId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(asError(error, "Could not load opportunities."));
  return Promise.all((data ?? []).map((row) => attachProject(row)));
}

export async function fetchOpportunity(id: string) {
  const { data, error } = await client()
    .from("opportunities")
    .select("id, project_id, contractor_profile_id, match_id, status, available_at, responded_at, expires_at, created_at")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(asError(error, "Opportunity not found."));
  return attachProject(data);
}

export async function fetchContractorProfileByUser(profileId: string) {
  const { data, error } = await client()
    .from("contractor_profiles")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(asError(error, "Could not load your contractor profile."));
  return data;
}

export async function updateContractorProfile(
  id: string,
  patch: Database["public"]["Tables"]["contractor_profiles"]["Update"],
) {
  if (patch.bio !== undefined) rejectContactLeak(patch.bio);
  if (patch.headline !== undefined) rejectContactLeak(patch.headline);
  const { error } = await client().from("contractor_profiles").update(patch).eq("id", id);
  if (error) throw new Error(asError(error, "Could not save your profile."));
}

export async function fetchContractorServices(contractorProfileId: string) {
  const { data, error } = await client()
    .from("contractor_services")
    .select("id, contractor_profile_id, category_id")
    .eq("contractor_profile_id", contractorProfileId);
  if (error) throw new Error(asError(error, "Could not load services."));
  return data ?? [];
}

export async function setContractorServices(contractorProfileId: string, categoryIds: string[]) {
  const supabase = client();
  const { error: delError } = await supabase
    .from("contractor_services")
    .delete()
    .eq("contractor_profile_id", contractorProfileId);
  if (delError) throw new Error(asError(delError, "Could not update services."));
  if (categoryIds.length === 0) return;
  const { error } = await supabase.from("contractor_services").insert(
    categoryIds.map((category_id) => ({ contractor_profile_id: contractorProfileId, category_id })),
  );
  if (error) throw new Error(asError(error, "Could not save services."));
}

export async function fetchContractorAreas(contractorProfileId: string) {
  const { data, error } = await client()
    .from("contractor_service_areas")
    .select("*")
    .eq("contractor_profile_id", contractorProfileId);
  if (error) throw new Error(asError(error, "Could not load service areas."));
  return data ?? [];
}

export async function upsertContractorArea(row: {
  id?: string;
  contractor_profile_id: string;
  mode: ServiceAreaMode;
  center_zip: string | null;
  radius_miles: number | null;
  zip_codes: string[];
  label: string | null;
}) {
  const supabase = client();
  if (row.id) {
    const { error } = await supabase
      .from("contractor_service_areas")
      .update({
        mode: row.mode,
        center_zip: row.center_zip,
        radius_miles: row.radius_miles,
        zip_codes: row.zip_codes,
        label: row.label,
      })
      .eq("id", row.id);
    if (error) throw new Error(asError(error, "Could not save the service area."));
    return;
  }
  const { error } = await supabase.from("contractor_service_areas").insert({
    contractor_profile_id: row.contractor_profile_id,
    mode: row.mode,
    center_zip: row.center_zip,
    radius_miles: row.radius_miles,
    zip_codes: row.zip_codes,
    label: row.label,
  });
  if (error) throw new Error(asError(error, "Could not save the service area."));
}

export async function fetchCredentials(contractorProfileId: string) {
  const { data, error } = await client()
    .from("contractor_credentials")
    .select("id, contractor_profile_id, kind, label, document_path, status, expires_at")
    .eq("contractor_profile_id", contractorProfileId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(asError(error, "Could not load credentials."));
  return data ?? [];
}

export async function addCredential(row: Database["public"]["Tables"]["contractor_credentials"]["Insert"]) {
  const { error } = await client().from("contractor_credentials").insert(row);
  if (error) throw new Error(asError(error, "Could not add the credential."));
}

export async function submitCredential(id: string) {
  const { error } = await client().from("contractor_credentials").update({ status: "PENDING" }).eq("id", id);
  if (error) throw new Error(asError(error, "Could not submit the credential."));
}

export async function updateCredential(
  id: string,
  patch: Database["public"]["Tables"]["contractor_credentials"]["Update"],
) {
  const { error } = await client().from("contractor_credentials").update(patch).eq("id", id);
  if (error) throw new Error(asError(error, "Could not update the credential."));
}

export async function uploadContractorDoc(params: {
  userId: string;
  folder: "portfolio" | "credentials";
  file: File;
}) {
  if (!isAllowedContractorDoc(params.file.type)) throw new Error("Use a JPEG, PNG, WebP, or PDF.");
  if (params.file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
  const path = `${params.userId}/${params.folder}/${crypto.randomUUID()}-${sanitizeUploadName(params.file.name)}`;
  const { error } = await client().storage.from("contractor-docs").upload(path, params.file, {
    contentType: params.file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function addPortfolioItem(row: Database["public"]["Tables"]["contractor_portfolio"]["Insert"]) {
  rejectContactLeak(row.title);
  rejectContactLeak(row.description);
  const { error } = await client().from("contractor_portfolio").insert({
    ...row,
    title: looksLikeFilename(row.title ?? "") ? "Portfolio photo" : row.title,
    privacy_state: row.privacy_state ?? "REVIEW_REQUIRED",
  });
  if (error) throw new Error(asError(error, "Could not add portfolio photo."));
}

export async function deletePortfolioItem(id: string) {
  const { error } = await client().from("contractor_portfolio").delete().eq("id", id);
  if (error) throw new Error(asError(error, "Could not remove the photo."));
}

export async function updateProfileAvatar(profileId: string, avatarUrl: string | null) {
  const { error } = await client().from("profiles").update({ avatar_url: avatarUrl }).eq("id", profileId);
  if (error) throw new Error(asError(error, "Could not save your photo."));
}

export async function fetchPortfolio(contractorProfileId: string) {
  const { data, error } = await client()
    .from("contractor_portfolio")
    .select("id, contractor_profile_id, title, description, storage_path, sort_order, privacy_state")
    .eq("contractor_profile_id", contractorProfileId)
    .order("sort_order");
  if (error) throw new Error(asError(error, "Could not load portfolio."));
  return data ?? [];
}

export async function fetchEstimateQuestions(projectId: string, opportunityId?: string) {
  let query = client()
    .from("estimate_questions")
    .select("id, project_id, opportunity_id, asked_by_contractor_profile_id, prompt, answer_text, answered_at, created_at")
    .eq("project_id", projectId)
    .order("created_at");
  if (opportunityId) query = query.eq("opportunity_id", opportunityId);
  const { data, error } = await query;
  if (error) throw new Error(asError(error, "Could not load questions."));
  return data ?? [];
}

export async function askEstimateQuestion(row: {
  project_id: string;
  opportunity_id: string;
  asked_by_contractor_profile_id: string;
  prompt: string;
}) {
  rejectContactLeak(row.prompt);
  const { error } = await client().from("estimate_questions").insert(row);
  if (error) throw new Error(asError(error, "Could not send the question."));
}

export async function answerEstimateQuestion(id: string, answerText: string) {
  rejectContactLeak(answerText);
  const { error } = await client().from("estimate_questions").update({ answer_text: answerText }).eq("id", id);
  if (error) throw new Error(asError(error, "Could not save the answer."));
}

export async function fetchOrCreateEstimate(params: {
  projectId: string;
  opportunityId: string;
  contractorProfileId: string;
}) {
  const supabase = client();
  const existing = await supabase
    .from("estimates")
    .select("*")
    .eq("opportunity_id", params.opportunityId)
    .maybeSingle();
  if (existing.error) throw new Error(asError(existing.error, "Could not load the estimate."));
  if (existing.data) return existing.data;
  const { data, error } = await supabase
    .from("estimates")
    .insert({
      project_id: params.projectId,
      opportunity_id: params.opportunityId,
      contractor_profile_id: params.contractorProfileId,
    })
    .select()
    .single();
  if (error || !data) throw new Error(asError(error, "Could not start an estimate."));
  return data;
}

export async function fetchEstimate(id: string) {
  const { data, error } = await client().from("estimates").select("*").eq("id", id).single();
  if (error || !data) throw new Error(asError(error, "Estimate not found."));
  return data;
}

export async function fetchEstimateItems(estimateId: string) {
  const { data, error } = await client()
    .from("estimate_items")
    .select("id, estimate_id, label, quantity, unit_cents, line_total_cents, kind, unit_label, sort_order")
    .eq("estimate_id", estimateId)
    .order("sort_order");
  if (error) throw new Error(asError(error, "Could not load line items."));
  return data ?? [];
}

export async function addEstimateItem(row: Database["public"]["Tables"]["estimate_items"]["Insert"]) {
  rejectContactLeak(row.label);
  const { error } = await client().from("estimate_items").insert(row);
  if (error) throw new Error(asError(error, "Could not add the line item."));
}

export async function updateEstimateItem(
  id: string,
  patch: Database["public"]["Tables"]["estimate_items"]["Update"],
) {
  if (patch.label !== undefined) rejectContactLeak(patch.label);
  const { error } = await client().from("estimate_items").update(patch).eq("id", id);
  if (error) throw new Error(asError(error, "Could not update the line item."));
}

export async function deleteEstimateItem(id: string) {
  const { error } = await client().from("estimate_items").delete().eq("id", id);
  if (error) throw new Error(asError(error, "Could not remove the line item."));
}

export async function updateEstimateDetails(
  id: string,
  patch: Database["public"]["Tables"]["estimates"]["Update"],
) {
  if (patch.notes !== undefined) rejectContactLeak(patch.notes);
  const { error } = await client().from("estimates").update(patch).eq("id", id);
  if (error) throw new Error(asError(error, "Could not save the estimate."));
}

export async function fetchProjectEstimates(projectId: string) {
  const { data, error } = await client()
    .from("estimates")
    .select("*")
    .eq("project_id", projectId)
    .in("status", [
      "SUBMITTED",
      "SENT",
      "REVISED",
      "VIEWED",
      "ACCEPTED",
      "DECLINED",
      "WITHDRAWN",
      "EXPIRED",
      "SUPERSEDED",
    ])
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(asError(error, "Could not load estimates."));
  return data ?? [];
}

export type PublicDirectoryRpcRow = {
  id: string;
  display_label: string;
  primary_trade: string | null;
  categories: string[] | null;
  service_area: string | null;
  years_experience: number | null;
  rating_average: number | null;
  rating_count: number | null;
  badges: Json;
  short_description: string | null;
  about?: string | null;
};

export type PublicDirectoryPortfolioRow = {
  id: string;
  caption: string;
  sort_order: number;
};

export type PublicDirectoryReviewRow = {
  id: string;
  rating: number;
  body: string;
};

function parseDirectoryBadges(value: Json | null | undefined): Array<{ kind: string; label: string }> {
  if (!Array.isArray(value)) return [];
  const badges: Array<{ kind: string; label: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const kind = "kind" in item && typeof item.kind === "string" ? item.kind : "";
    const label = "label" in item && typeof item.label === "string" ? item.label : "";
    if (kind || label) badges.push({ kind, label });
  }
  return badges;
}

export async function fetchPublicContractorDirectory(): Promise<PublicDirectoryRpcRow[]> {
  const { data, error } = await client().rpc("list_public_directory_contractors");
  if (error) throw new Error(asError(error, "Could not load the contractor directory."));
  return (Array.isArray(data) ? data : []) as PublicDirectoryRpcRow[];
}

export async function fetchPublicContractor(id: string): Promise<PublicDirectoryRpcRow | null> {
  const { data, error } = await client().rpc("get_public_directory_contractor", { p_id: id });
  if (error) throw new Error(asError(error, "Could not load the contractor."));
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PublicDirectoryRpcRow | undefined) ?? null;
}

export function directoryRowBadges(row: PublicDirectoryRpcRow) {
  return parseDirectoryBadges(row.badges);
}

export async function fetchPublicContractorExtras(id: string) {
  const supabase = client();
  const [services, areas, badges, portfolio] = await Promise.all([
    supabase.from("contractor_public_services").select("id, contractor_profile_id, category_id, category_slug, category_name").eq("contractor_profile_id", id),
    supabase.from("contractor_public_areas").select("id, contractor_profile_id, label").eq("contractor_profile_id", id),
    supabase.from("contractor_verified_credential_badges").select("id, contractor_profile_id, kind, label, status, expires_at").eq("contractor_profile_id", id),
    supabase.from("contractor_public_portfolio").select("id, contractor_profile_id, sort_order, caption").eq("contractor_profile_id", id).order("sort_order"),
  ]);
  return {
    services: services.data ?? [],
    areas: areas.data ?? [],
    badges: badges.data ?? [],
    portfolio: portfolio.data ?? [],
  };
}

export async function fetchPublicContractorPortfolio(id: string): Promise<PublicDirectoryPortfolioRow[]> {
  const { data, error } = await client().rpc("list_public_directory_portfolio", { p_id: id });
  if (error) throw new Error(asError(error, "Could not load screened portfolio."));
  return (Array.isArray(data) ? data : []) as PublicDirectoryPortfolioRow[];
}

export async function fetchPublicContractorReviews(id: string): Promise<PublicDirectoryReviewRow[]> {
  const { data, error } = await client().rpc("list_public_directory_reviews", { p_id: id });
  if (error) throw new Error(asError(error, "Could not load verified reviews."));
  return (Array.isArray(data) ? data : []) as PublicDirectoryReviewRow[];
}

export async function signedContractorDocUrl(path: string): Promise<string | null> {
  const { data, error } = await client().storage.from("contractor-docs").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export const TIMING_LABELS: Record<TimingPreference, string> = {
  ASAP: "As soon as possible",
  WITHIN_A_WEEK: "Within a week",
  WITHIN_A_MONTH: "Within a month",
  SPECIFIC_DATE: "A specific date",
  FLEXIBLE: "Flexible",
};

export async function fetchMyRatingStats(): Promise<RpcJson> {
  const { data, error } = await client().rpc("my_rating_stats");
  if (error) throw new Error(asError(error, "Could not load ratings."));
  return (data ?? {}) as RpcJson;
}

export async function fetchPublicFeeSchedule(): Promise<RpcJson> {
  const { data, error } = await client().rpc("list_public_fee_schedule");
  if (error) throw new Error(asError(error, "Could not load the fee schedule."));
  return (data ?? {}) as RpcJson;
}

export async function createTrustDispute(input: {
  category: string;
  explanation: string;
  disputedReviewId?: string | null;
  evidencePath?: string | null;
}): Promise<RpcJson> {
  const { data, error } = await client().rpc("create_trust_dispute", {
    p_category: input.category,
    p_explanation: input.explanation,
    p_disputed_review_id: input.disputedReviewId ?? null,
    p_evidence_path: input.evidencePath ?? null,
  });
  if (error) throw new Error(asError(error, "Could not file the dispute."));
  return (data ?? {}) as RpcJson;
}

export async function fetchMyTrustDisputes(): Promise<RpcJson[]> {
  const { data, error } = await client().rpc("list_my_trust_disputes");
  if (error) throw new Error(asError(error, "Could not load disputes."));
  return (Array.isArray(data) ? data : []) as RpcJson[];
}

export async function fetchMyTrustDispute(id: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("get_my_trust_dispute", { p_dispute_id: id });
  if (error) throw new Error(asError(error, "Could not load the dispute."));
  return (data ?? {}) as RpcJson;
}

export async function fetchAdminTrustDisputes(status?: string | null): Promise<RpcJson[]> {
  const { data, error } = await client().rpc("list_admin_trust_disputes", { p_status: status ?? null });
  if (error) throw new Error(asError(error, "Could not load the dispute queue."));
  return (Array.isArray(data) ? data : []) as RpcJson[];
}

export async function fetchAdminTrustDispute(id: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("get_admin_trust_dispute", { p_dispute_id: id });
  if (error) throw new Error(asError(error, "Could not load the dispute."));
  return (data ?? {}) as RpcJson;
}

export async function resolveAdminTrustDispute(
  id: string,
  resolution: string,
  note?: string,
): Promise<RpcJson> {
  const { data, error } = await client().rpc("admin_resolve_trust_dispute", {
    p_dispute_id: id,
    p_resolution: resolution,
    p_note: note ?? null,
  });
  if (error) throw new Error(asError(error, "Could not resolve the dispute."));
  return (data ?? {}) as RpcJson;
}

export async function requestAccountDeletion(confirmPhrase: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("request_account_deletion", { p_confirm_phrase: confirmPhrase });
  if (error) throw new Error(asError(error, "Could not close the account."));
  return (data ?? {}) as RpcJson;
}

export async function uploadDisputeEvidence(userId: string, disputeFolder: string, file: File): Promise<string> {
  const path = `${userId}/${disputeFolder}/${sanitizeUploadName(file.name)}`;
  const { error } = await client().storage.from("dispute-evidence").upload(path, file, { upsert: false });
  if (error) throw new Error(asError(error, "Could not upload evidence."));
  return path;
}
