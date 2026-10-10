import {
  approval,
  booking,
  categories,
  contractorProfile,
  contractorPublic,
  estimate,
  estimateItems,
  messages,
  opportunity,
  project,
  questions,
  sharedContact,
  thread,
} from "./fixtures.mjs";

const ok = async () => ({});

export async function fetchCustomerProjects() {
  return [project];
}
export async function fetchMyCustomerProject() {
  return project;
}
export async function fetchProject() {
  return project;
}
export async function fetchMyBookings() {
  return [booking];
}
export async function fetchBooking() {
  return booking;
}
export async function fetchProjectBooking() {
  return booking;
}
export async function fetchChangeOrders() {
  return [
    {
      id: "co-1",
      booking_id: "book-1",
      created_by: "pro-1",
      created_by_role: "CONTRACTOR",
      description: "Add a walk gate on the driveway side.",
      amount_delta_cents: 18000,
      status: "PROPOSED",
      customer_approved_at: null,
      customer_approved_by: null,
      contractor_acked_at: null,
      contractor_acked_by: null,
      decided_at: null,
      created_at: "2026-04-02T15:00:00.000Z",
      updated_at: "2026-04-02T15:00:00.000Z",
    },
  ];
}
export async function fetchBookingReviews() {
  return [];
}
export async function fetchHireAgainContractors() {
  return [{ contractor_profile_id: "pro-1", display_label: "Northside Fence Co.", project_title: project.title }];
}
export async function expireStalePendingBookings() {
  return 0;
}
export async function fetchProjectEstimates() {
  return [estimate];
}
export async function fetchEstimate() {
  return estimate;
}
export async function fetchEstimateItems() {
  return estimateItems;
}
export async function fetchPublicContractor() {
  return contractorPublic;
}
export async function fetchPublicContractorExtras() {
  return { services: [], areas: [], badges: [], portfolio: [] };
}
export async function fetchProjectPhotos() {
  return [];
}
export async function fetchProjectAnswers() {
  return [{ id: "ans-1", question_id: "q-1", answer_text: "20 to 50 feet" }];
}
export async function fetchPrivateLocation() {
  return { project_id: "proj-1", street_line1: sharedContact.street_line1, street_line2: null, lat: null, lng: null };
}
export async function fetchServiceCategories() {
  return categories;
}
export async function fetchServiceQuestions() {
  return questions;
}
export async function fetchProjectNotices() {
  return [];
}
export async function fetchMyProjectConnectionCards() {
  return [];
}
export async function fetchMyNotifications() {
  return [
    {
      id: "note-1",
      kind: "estimate.submitted",
      title: "New estimate",
      body: "Northside Fence Co. sent an estimate.",
      entity_type: "estimate",
      entity_id: "est-1",
      payload: { project_id: "proj-1", estimate_id: "est-1" },
      channel: "in_app",
      read_at: null,
      created_at: "2026-04-02T15:00:00.000Z",
    },
  ];
}
export async function markNotificationRead() {
  return {};
}
export async function markEstimateViewed() {
  return {};
}
export async function signedProjectPhotoUrl() {
  return null;
}
export async function fetchContractorProfileByUser() {
  return contractorProfile;
}
export async function fetchMyOpportunities() {
  return [opportunity];
}
export async function fetchOpportunity() {
  return opportunity;
}
export async function fetchContractorServices() {
  return [{ id: "svc-1", contractor_profile_id: "pro-1", category_id: "cat-fence" }];
}
export async function fetchContractorAreas() {
  return [
    {
      id: "area-1",
      contractor_profile_id: "pro-1",
      mode: "RADIUS",
      center_zip: "30318",
      radius_miles: 25,
      zip_codes: ["30318"],
      label: "Northwest Atlanta",
    },
  ];
}
export async function fetchCredentials() {
  return [];
}
export async function fetchPortfolio() {
  return [];
}
export async function fetchOrCreateEstimate() {
  return { ...estimate, status: "DRAFT" };
}
export async function fetchEstimateQuestions() {
  return [];
}
export async function fetchProjectConnectionAvailability() {
  return {
    project_id: "proj-1",
    max: 3,
    occupied: 0,
    remaining: 3,
    completed: 0,
    accepting_connections: true,
    full: false,
    fee_cents: 499,
    checkout_enabled: false,
    payments_live: false,
    charges_live: false,
  };
}
export async function fetchMyProjectConnections() {
  return [];
}
export async function fetchConnectionFeeCheckoutFlags() {
  return { enabled: false, checkout_enabled: false };
}
export async function fetchMyEstimates() {
  return [
    {
      id: "est-1",
      project_id: "proj-1",
      opportunity_id: "opp-1",
      project_title: project.title,
      status: "SENT",
      total_cents: 145000,
      submitted_at: "2026-04-02T15:00:00.000Z",
      first_viewed_at: null,
      last_viewed_at: null,
      view_count: 0,
      accepted_at: null,
      declined_at: null,
      decline_reason: null,
      withdrawn_at: null,
      created_at: "2026-04-02T15:00:00.000Z",
    },
  ];
}
export const updateContractorProfile = ok;
export const setContractorServices = ok;
export const upsertContractorArea = ok;
export const updateEstimateDetails = ok;
export const addEstimateItem = ok;
export const deleteEstimateItem = ok;
export const submitEstimate = async () => ({ status: "SENT" });
export const selectEstimate = ok;
export const declineEstimate = ok;
export const confirmBookingHired = ok;
export const startBooking = ok;
export const completeBooking = ok;
export const cancelPendingBooking = ok;
export const disputeBooking = ok;
export const proposeChangeOrder = ok;
export const respondChangeOrder = ok;
export const submitBookingReview = ok;
export const endContractorJob = async () => ({ status: "PASSED" });
export const acceptOpportunity = ok;
export const requestProjectConnection = ok;
export const startConnectionCheckout = ok;
export const reconcileConnectionCheckout = ok;

export async function listMyMessageThreads() {
  return [thread];
}
export async function ensureMessageThread() {
  return "thread-1";
}
export async function listProjectMessages() {
  return messages;
}
export async function markMessageThreadRead() {
  return undefined;
}
export async function sendProjectMessage() {
  return undefined;
}
export function subscribeToProjectMessages() {
  return () => undefined;
}

export async function getSharedProjectContact() {
  return sharedContact;
}
export async function shareProjectContact() {
  return sharedContact;
}

export async function listInAppNotifications() {
  return [
    {
      id: "bell-1",
      kind: "estimate.submitted",
      title: "New estimate",
      body: "A pro sent a price for the fence.",
      path: "/app/customer/projects/proj-1/compare",
      readAt: null,
      createdAt: "2026-04-02T15:00:00.000Z",
      category: "estimates",
    },
  ];
}
export async function updateNotificationPreference() {
  return undefined;
}
export async function markAllNotificationsRead() {
  return undefined;
}
export async function countMyPushSubscriptions() {
  return 0;
}

export async function listContractorApprovals() {
  return [approval];
}
export async function getContractorApproval() {
  return approval;
}
export async function countPendingContractorApprovals() {
  return 1;
}
export async function adminApproveContractor() {
  return { ...approval, approval_status: "APPROVED" };
}
export async function adminRejectContractor() {
  return { ...approval, approval_status: "REJECTED" };
}
export async function adminRequestContractorInfo() {
  return approval;
}
export async function adminListPortfolioReviewQueue() {
  return [
    {
      id: "photo-1",
      contractor_profile_id: "pro-1",
      contractor_label: "Northside Fence Co.",
      title: "Cedar fence repair",
      description: "Replaced a broken panel on a side yard.",
      storage_path: "user/portfolio/cedar.jpg",
      created_at: "2026-10-01T15:00:00.000Z",
    },
  ];
}
export async function adminSetPortfolioPrivacy() {
  return { id: "photo-1", privacy_state: "PUBLIC_SAFE" };
}
export async function signedContractorDocUrl() {
  return "/images/marketing/official-portfolio-deck-360w.jpg";
}
export async function fetchPortfolioEditorRows() {
  return [
    {
      id: "photo-1",
      contractor_profile_id: "pro-1",
      title: "Cedar fence repair",
      description: null,
      storage_path: "user/portfolio/cedar.jpg",
      sort_order: 0,
      privacy_state: "REVIEW_REQUIRED",
      imageUrl: "/images/marketing/official-portfolio-deck-360w.jpg",
    },
  ];
}
export async function addPortfolioItem() {
  return undefined;
}
export async function updatePortfolioItem() {
  return undefined;
}
export async function deletePortfolioItem() {
  return undefined;
}
export async function uploadContractorDoc() {
  return "user/portfolio/new.jpg";
}
