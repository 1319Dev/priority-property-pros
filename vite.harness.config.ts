import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import baseConfig from "./vite.config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(rootDir, "e2e/harness/apiFixtures.mjs");

const swaps: Array<{ id: string; match: RegExp; real: string; names: string[] }> = [
  {
    id: "\0ppp-marketplace-api",
    match: /\/marketplace\/api(?:\.ts)?$/,
    real: path.resolve(rootDir, "src/lib/marketplace/api.ts"),
    names: [
      "fetchCustomerProjects",
      "fetchMyCustomerProject",
      "fetchProject",
      "fetchMyBookings",
      "fetchBooking",
      "fetchBookingJobContact",
      "fetchProjectBooking",
      "fetchChangeOrders",
      "fetchBookingReviews",
      "fetchHireAgainContractors",
      "expireStalePendingBookings",
      "findAdminBookingsByReference",
      "fetchProjectEstimates",
      "fetchEstimate",
      "fetchEstimateItems",
      "fetchPublicContractor",
      "fetchPublicContractorExtras",
      "fetchProjectPhotos",
      "fetchProjectAnswers",
      "fetchPrivateLocation",
      "fetchServiceCategories",
      "fetchServiceQuestions",
      "fetchProjectNotices",
      "fetchMyProjectConnectionCards",
      "fetchMyNotifications",
      "markNotificationRead",
      "markEstimateViewed",
      "signedProjectPhotoUrl",
      "fetchContractorProfileByUser",
      "fetchMyOpportunities",
      "fetchOpportunity",
      "fetchContractorServices",
      "fetchContractorAreas",
      "fetchCredentials",
      "fetchPortfolio",
      "fetchPortfolioEditorRows",
      "addPortfolioItem",
      "updatePortfolioItem",
      "deletePortfolioItem",
      "uploadContractorDoc",
      "signedContractorDocUrl",
      "fetchOrCreateEstimate",
      "fetchEstimateQuestions",
      "fetchProjectConnectionAvailability",
      "fetchMyProjectConnections",
      "fetchConnectionFeeCheckoutFlags",
      "fetchMyEstimates",
      "updateContractorProfile",
      "setContractorServices",
      "upsertContractorArea",
      "updateEstimateDetails",
      "addEstimateItem",
      "deleteEstimateItem",
      "submitEstimate",
      "selectEstimate",
      "declineEstimate",
      "confirmBookingHired",
      "startBooking",
      "completeBooking",
      "cancelPendingBooking",
      "disputeBooking",
      "proposeChangeOrder",
      "respondChangeOrder",
      "submitBookingReview",
      "updateBookingReview",
      "endContractorJob",
      "acceptOpportunity",
      "requestProjectConnection",
      "startConnectionCheckout",
      "reconcileConnectionCheckout",
    ],
  },
  {
    id: "\0ppp-messaging-api",
    match: /\/marketplace\/messagingApi(?:\.ts)?$/,
    real: path.resolve(rootDir, "src/lib/marketplace/messagingApi.ts"),
    names: [
      "listMyMessageThreads",
      "ensureMessageThread",
      "listProjectMessages",
      "markMessageThreadRead",
      "sendProjectMessage",
      "subscribeToProjectMessages",
    ],
  },
  {
    id: "\0ppp-contact-api",
    match: /\/marketplace\/contactShareApi(?:\.ts)?$/,
    real: path.resolve(rootDir, "src/lib/marketplace/contactShareApi.ts"),
    names: ["getSharedProjectContact", "shareProjectContact"],
  },
  {
    id: "\0ppp-notifications-api",
    match: /\/notifications\/api(?:\.ts)?$/,
    real: path.resolve(rootDir, "src/lib/notifications/api.ts"),
    names: ["listInAppNotifications", "updateNotificationPreference", "markNotificationRead", "markAllNotificationsRead", "countMyPushSubscriptions"],
  },
  {
    id: "\0ppp-approvals-api",
    match: /\/admin\/approvalsApi(?:\.ts)?$/,
    real: path.resolve(rootDir, "src/lib/admin/approvalsApi.ts"),
    names: [
      "listContractorApprovals",
      "getContractorApproval",
      "countPendingContractorApprovals",
      "adminApproveContractor",
      "adminRejectContractor",
      "adminRequestContractorInfo",
      "adminListPortfolioReviewQueue",
      "adminSetPortfolioPrivacy",
    ],
  },
  {
    id: "\0ppp-platform-reviews-api",
    match: /\/marketplace\/platformReviewsApi(?:\.ts)?$/,
    real: path.resolve(rootDir, "src/lib/marketplace/platformReviewsApi.ts"),
    names: ["adminListPlatformReviews", "adminSetPlatformReviewStatus"],
  },
];

function harnessMocks(): Plugin {
  return {
    name: "ppp-layout-harness",
    enforce: "pre",
    resolveId(source, importer) {
      if (importer?.startsWith("\0")) return null;
      if (/AuthProvider(?:\.tsx)?$/.test(source) && !importer?.includes("MockAuthProvider")) {
        return path.resolve(rootDir, "e2e/harness/MockAuthProvider.jsx");
      }
      for (const swap of swaps) {
        if (swap.match.test(source)) return swap.id;
      }
      return null;
    },
    load(id) {
      const swap = swaps.find((item) => item.id === id);
      if (!swap) return null;
      const named = swap.names.map((name) => `export { ${name} } from ${JSON.stringify(fixtures)};`).join("\n");
      return `export * from ${JSON.stringify(swap.real)};\n${named}\n`;
    },
  };
}

export default defineConfig((env) => {
  const resolved = baseConfig(env);
  return mergeConfig(resolved, {
    // Dev-server only. `vite build` uses vite.config.ts, so this never changes
    // the production bundle or BASE_PATH.
    plugins: env.command === "serve" ? [harnessMocks()] : [],
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
  });
});
