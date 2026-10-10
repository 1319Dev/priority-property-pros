import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ScrollToTop } from "./components/layout/ScrollToTop";
import { RequireAdmin, RequireAuth, RequireRole } from "./lib/auth/guards";
import { BecomeAProPage } from "./pages/BecomeAProPage";
import { ContactPage } from "./pages/ContactPage";
import { FaqPage } from "./pages/FaqPage";
import { FindAProPage, PublicContractorPage } from "./pages/FindAProPage";
import { HomePage } from "./pages/HomePage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { LegacyPathRedirect } from "./pages/LegacyPathRedirect";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PricingPage } from "./pages/PricingPage";
import { PostProjectPage } from "./pages/PostProjectPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { SignUpRolePage } from "./pages/SignUpRolePage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { AccountStatusPage } from "./pages/AccountStatusPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { NotificationSettingsPage } from "./pages/app/NotificationSettingsPage";
import { NotificationHistoryPage } from "./pages/app/NotificationHistoryPage";
import { ActivateAccountPage } from "./pages/ActivateAccountPage";
import { TrustPage } from "./pages/TrustPage";
import { CustomerShell } from "./pages/app/CustomerShell";
import { ProShell } from "./pages/app/ProShell";
import { VerifierShell } from "./pages/app/VerifierShell";
import { AdminShell } from "./pages/app/AdminShell";
import { AdminTwoFactorPage } from "./pages/app/admin/AdminTwoFactorPage";
import {
  AccountPage,
  CustomerHomePage,
  CustomerMessagesPage,
  CustomerProjectsPage,
} from "./pages/app/CustomerPages";
import { CompareEstimatesPage, CustomerEstimateDetailPage, CustomerProjectDetailPage } from "./pages/app/customer/CustomerMarketplacePages";
import { CustomerBookingDetailPage, CustomerBookingsPage, HireAgainPage } from "./pages/app/customer/BookingPages";
import { ProjectWizardPage } from "./pages/app/customer/ProjectWizardPage";
import { ProjectEditPage } from "./pages/app/customer/ProjectEditPage";
import { ProHomePage, ProJobsPage, ProMessagesPage } from "./pages/app/ProPages";
import {
  EstimateBuilderPage,
  OpportunitiesPage,
  OpportunityDetailPage,
  ProOnboardingPage,
} from "./pages/app/pro/ProMarketplacePages";
import { ConnectionCheckoutReturnPage } from "./pages/app/pro/ConnectionCheckoutReturnPage";
import { ProProfilePage } from "./pages/app/pro/ProProfilePages";
import { ProEstimatesPage } from "./pages/app/pro/ProEstimatesPages";
import { ProBookingDetailPage, ProBookingRedirect, ProBookingsPage, ProHiredJobByProjectPage } from "./pages/app/pro/ProBookingPages";
import { VerifierHomePage, VerifierMessagesPage, VerifierVisitsPage } from "./pages/app/VerifierPages";
import {
  AdminApprovalDetailPage,
  AdminApprovalsPage,
  AdminAuditPage,
  AdminBookingsPage,
  AdminHomePage,
  AdminPeoplePage,
  AdminReviewsPage,
} from "./pages/app/AdminPages";

const DevNotificationPreview = import.meta.env.DEV
  ? lazy(() =>
      import("./pages/dev/NotificationPreviewPage").then((mod) => ({ default: mod.NotificationPreviewPage })),
    )
  : null;

function StripTrailingSlash() {
  const location = useLocation();
  if (location.pathname.length > 1 && location.pathname.endsWith("/")) {
    const pathname = location.pathname.replace(/\/+$/, "");
    return <Navigate to={`${pathname}${location.search}${location.hash}`} replace />;
  }
  return null;
}

export default function App() {
  return (
    <>
      <StripTrailingSlash />
      <ScrollToTop />
      <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/find-a-pro" element={<FindAProPage />} />
        <Route path="/find-a-pro/example/:slug" element={<Navigate to="/find-a-pro" replace />} />
        <Route path="/find-a-pro/:contractorId" element={<PublicContractorPage />} />
        <Route path="/examples/homeowners/:slug" element={<Navigate to="/find-a-pro" replace />} />
        <Route path="/examples/verifiers/:slug" element={<Navigate to="/find-a-pro" replace />} />
        <Route path="/examples/projects/:slug" element={<Navigate to="/find-a-pro" replace />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/become-a-pro" element={<BecomeAProPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/services" element={<LegacyPathRedirect />} />
        <Route path="/about" element={<LegacyPathRedirect />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpRolePage />} />
        <Route path="/sign-up/:role" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/verify" element={<VerifyEmailPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/account/status" element={<AccountStatusPage />} />
        <Route path="/account/activate" element={<ActivateAccountPage />} />
        <Route path="/post-project" element={<PostProjectPage />} />
        <Route path="/trust" element={<TrustPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      {DevNotificationPreview ? (
        <Route
          path={"/__preview/notifications"}
          element={
            <Suspense fallback={null}>
              <DevNotificationPreview />
            </Suspense>
          }
        />
      ) : null}

      <Route element={<RequireAuth />}>
        <Route element={<RequireRole role="CUSTOMER" />}>
          <Route path="/app/customer" element={<CustomerShell />}>
            <Route index element={<CustomerHomePage />} />
            <Route path="projects" element={<CustomerProjectsPage />} />
            <Route path="projects/new/wizard" element={<ProjectWizardPage />} />
            <Route path="projects/:projectId/wizard" element={<Navigate to="/app/customer/projects/new/wizard" replace />} />
            <Route path="projects/:projectId/edit" element={<ProjectEditPage />} />
            <Route path="projects/:projectId/compare" element={<CompareEstimatesPage />} />
            <Route path="projects/:projectId/estimates/:estimateId" element={<CustomerEstimateDetailPage />} />
            <Route path="projects/:projectId" element={<CustomerProjectDetailPage />} />
            <Route path="bookings" element={<CustomerBookingsPage />} />
            <Route path="bookings/:bookingId" element={<CustomerBookingDetailPage />} />
            <Route path="hire-again" element={<HireAgainPage />} />
            <Route path="messages" element={<CustomerMessagesPage />} />
            <Route path="messages/:projectId/:contractorProfileId" element={<CustomerMessagesPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="notifications" element={<NotificationHistoryPage />} />
            <Route path="account/notifications" element={<NotificationSettingsPage />} />
          </Route>
        </Route>
        <Route element={<RequireRole role="CONTRACTOR" />}>
          <Route path="/app/pro" element={<ProShell />}>
            <Route index element={<ProHomePage />} />
            <Route path="jobs" element={<ProJobsPage />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="opportunities/:opportunityId/estimate" element={<EstimateBuilderPage />} />
            <Route path="opportunities/:opportunityId" element={<OpportunityDetailPage />} />
            <Route path="connections/return" element={<ConnectionCheckoutReturnPage />} />
            <Route path="jobs/project/:projectId" element={<ProHiredJobByProjectPage />} />
            <Route path="jobs/:bookingId" element={<ProBookingDetailPage />} />
            <Route path="bookings" element={<ProBookingsPage />} />
            <Route path="bookings/:bookingId" element={<ProBookingRedirect />} />
            <Route path="estimates" element={<ProEstimatesPage />} />
            <Route path="onboarding" element={<ProOnboardingPage />} />
            <Route path="profile" element={<ProProfilePage />} />
            <Route path="messages" element={<ProMessagesPage />} />
            <Route path="messages/:projectId/:contractorProfileId" element={<ProMessagesPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="notifications" element={<NotificationHistoryPage />} />
            <Route path="account/notifications" element={<NotificationSettingsPage />} />
          </Route>
        </Route>
        <Route element={<RequireRole role="VERIFIER" />}>
          <Route path="/app/verifier" element={<VerifierShell />}>
            <Route index element={<VerifierHomePage />} />
            <Route path="visits" element={<VerifierVisitsPage />} />
            <Route path="messages" element={<VerifierMessagesPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="account/notifications" element={<NotificationSettingsPage />} />
          </Route>
        </Route>
        <Route element={<RequireAdmin />}>
          <Route path="/app/admin" element={<AdminShell />}>
            <Route index element={<AdminHomePage />} />
            <Route path="people" element={<AdminPeoplePage />} />
            <Route path="approvals" element={<AdminApprovalsPage />} />
            <Route path="approvals/:contractorProfileId" element={<AdminApprovalDetailPage />} />
            <Route path="reviews" element={<AdminReviewsPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
            <Route path="bookings" element={<AdminBookingsPage />} />
            <Route path="security" element={<AdminTwoFactorPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="account/notifications" element={<NotificationSettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route element={<AppShell />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </>
  );
}
