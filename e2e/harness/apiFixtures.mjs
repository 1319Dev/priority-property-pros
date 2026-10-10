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
export async function fetchProject(id) {
  if (id === "proj-2") {
    return {
      ...project,
      id: "proj-2",
      title: "Repair a sticking front door",
      city: "Decatur",
      reference_number: 1048,
      status: "CONTRACTOR_SELECTED",
    };
  }
  return project;
}
export async function fetchMyBookings() {
  return [
    booking,
    {
      ...booking,
      id: "book-2",
      project_id: "proj-2",
      estimate_id: "est-2",
      status: "PENDING",
      customer_hired_at: null,
      contractor_hired_at: null,
      amount_cents: 24000,
      billable_amount_cents: 24000,
      customer_amount_cents: 24000,
      contractor_earnings_cents: 24000,
    },
  ];
}
export async function fetchBooking() {
  return booking;
}
export async function fetchBookingJobContact(bookingId) {
  if (bookingId !== "book-1") {
    return { unlocked: false, customer_shared: false };
  }
  return {
    unlocked: true,
    customer_shared: true,
    contact_access_status: "UNLOCKED",
    first_name: "Christopher",
    last_name: "Homeowner",
    phone: sharedContact.phone,
    email: sharedContact.email,
    street_line1: sharedContact.street_line1,
    street_line2: sharedContact.street_line2,
  };
}
export async function fetchProjectBooking(projectId) {
  if (projectId === "proj-1") return booking;
  return null;
}
export async function fetchChangeOrders(bookingId) {
  if (bookingId === "book-2") return [];
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
    {
      id: "co-0",
      booking_id: "book-1",
      created_by: "pro-1",
      created_by_role: "CONTRACTOR",
      description: "Confirm the existing gate hardware stays.",
      amount_delta_cents: 0,
      status: "APPROVED",
      customer_approved_at: "2026-04-02T16:00:00.000Z",
      customer_approved_by: "user-layout",
      contractor_acked_at: "2026-04-02T16:10:00.000Z",
      contractor_acked_by: "pro-1",
      decided_at: "2026-04-02T16:10:00.000Z",
      created_at: "2026-04-02T16:00:00.000Z",
      updated_at: "2026-04-02T16:10:00.000Z",
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
const secondEstimate = {
  ...estimate,
  id: "est-2",
  contractor_profile_id: "pro-2",
  total_cents: 98000,
  notes: "Labor and haul-away. I can start the week after next.",
  duration_hours: 16,
  available_from: "2026-04-20",
  submitted_at: "2026-04-03T15:00:00.000Z",
};

const secondItems = [
  {
    id: "item-3",
    estimate_id: "est-2",
    kind: "LABOR",
    label: "Reset the side fence",
    quantity: 16,
    unit_label: "hours",
    unit_cents: 4500,
    line_total_cents: 72000,
    sort_order: 0,
  },
  {
    id: "item-4",
    estimate_id: "est-2",
    kind: "CUSTOM",
    label: "Haul-away",
    quantity: 1,
    unit_label: "trip",
    unit_cents: 26000,
    line_total_cents: 26000,
    sort_order: 1,
  },
];

export async function fetchProjectEstimates() {
  return [estimate, secondEstimate];
}
export async function fetchEstimate(id) {
  return id === "est-2" ? secondEstimate : estimate;
}
export async function fetchEstimateItems(estimateId) {
  if (estimateId === "est-2") return secondItems;
  return estimateItems;
}
export async function fetchPublicContractor(id) {
  if (id === "pro-2") {
    return {
      ...contractorPublic,
      id: "pro-2",
      display_label: "Oak Street Repairs",
      rating_average: null,
      rating_count: 0,
      short_description: "Small fence repairs.",
    };
  }
  return contractorPublic;
}
export async function fetchPublicContractorExtras(id) {
  if (id === "pro-2") return { services: [], areas: [], badges: [], portfolio: [] };
  return {
    services: [],
    areas: [],
    badges: [{ id: "badge-1", contractor_profile_id: "pro-1", kind: "LICENSE", label: "TDLR-999-SECRET", status: "VERIFIED" }],
    portfolio: [],
  };
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
      payload: {
        project_id: "proj-1",
        estimate_id: "est-1",
        project_title: project.title,
        project_reference_number: project.reference_number,
      },
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
  return [
    opportunity,
    {
      ...opportunity,
      id: "opp-2",
      project_id: "proj-2",
      status: "AVAILABLE",
      projects: {
        ...project,
        id: "proj-2",
        title: "Repair a sticking front door",
        city: "Decatur",
        state: "GA",
        zip_code: "30030",
        reference_number: 1048,
        status: "POSTED",
      },
    },
    {
      ...opportunity,
      id: "opp-3",
      project_id: "proj-3",
      status: "PASSED",
      projects: {
        ...project,
        id: "proj-3",
        title: "Replace a storm-damaged gate",
        city: "Marietta",
        state: "GA",
        zip_code: "30060",
        reference_number: 1004,
        status: "POSTED",
      },
    },
  ];
}
export async function fetchOpportunity() {
  return opportunity;
}
export async function fetchContractorServices() {
  return [
    { id: "svc-1", contractor_profile_id: "pro-1", category_id: "cat-fence" },
    { id: "svc-2", contractor_profile_id: "pro-1", category_id: "cat-handyman" },
  ];
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
  return [
    thread,
    {
      ...thread,
      thread_id: "thread-2",
      project_id: "proj-2",
      project_title: "Repair a sticking front door",
      city: "Decatur",
      other_party_label: "Maria",
      booking_id: "book-2",
      unread_count: 0,
      last_preview: "The door sticks at the top.",
      project_reference_number: 1048,
    },
  ];
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
