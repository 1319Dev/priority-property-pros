import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAdmin, RequireAuth, RequireRole } from "./lib/auth/guards";
import { BecomeAProPage } from "./pages/BecomeAProPage";
import {
  DemoContractorPage,
  DemoHomeownerPage,
  DemoProjectPage,
  DemoVerifierPage,
  FindAProPage,
  PublicContractorPage,
} from "./pages/FindAProPage";
import { HomePage } from "./pages/HomePage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PricingPage } from "./pages/PricingPage";
import { PostProjectPage } from "./pages/PostProjectPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { SignUpRolePage } from "./pages/SignUpRolePage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { AccountStatusPage } from "./pages/AccountStatusPage";
import { TrustPage } from "./pages/TrustPage";
import { CustomerShell } from "./pages/app/CustomerShell";
import { ProShell } from "./pages/app/ProShell";
import { VerifierShell } from "./pages/app/VerifierShell";
import { AdminShell } from "./pages/app/AdminShell";
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
import { ProProfilePage } from "./pages/app/pro/ProProfilePages";
import { ProEstimatesPage } from "./pages/app/pro/ProEstimatesPages";
import { ProBookingDetailPage, ProBookingsPage } from "./pages/app/pro/ProBookingPages";
import { VerifierHomePage, VerifierMessagesPage, VerifierVisitsPage } from "./pages/app/VerifierPages";
import {
  AdminApprovalDetailPage,
  AdminApprovalsPage,
  AdminAuditPage,
  AdminBookingsPage,
  AdminHomePage,
  AdminPeoplePage,
} from "./pages/app/AdminPages";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/find-a-pro" element={<FindAProPage />} />
        <Route path="/find-a-pro/example/:slug" element={<DemoContractorPage />} />
        <Route path="/find-a-pro/:contractorId" element={<PublicContractorPage />} />
        <Route path="/examples/homeowners/:slug" element={<DemoHomeownerPage />} />
        <Route path="/examples/verifiers/:slug" element={<DemoVerifierPage />} />
        <Route path="/examples/projects/:slug" element={<DemoProjectPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/become-a-pro" element={<BecomeAProPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpRolePage />} />
        <Route path="/sign-up/:role" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/verify" element={<VerifyEmailPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/account/status" element={<AccountStatusPage />} />
        <Route path="/post-project" element={<PostProjectPage />} />
        <Route path="/trust" element={<TrustPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<RequireRole role="CUSTOMER" />}>
          <Route path="/app/customer" element={<CustomerShell />}>
            <Route index element={<CustomerHomePage />} />
            <Route path="projects" element={<CustomerProjectsPage />} />
            <Route path="projects/new/wizard" element={<ProjectWizardPage />} />
            <Route path="projects/:projectId/wizard" element={<ProjectWizardPage />} />
            <Route path="projects/:projectId/edit" element={<ProjectEditPage />} />
            <Route path="projects/:projectId/compare" element={<CompareEstimatesPage />} />
            <Route path="projects/:projectId/estimates/:estimateId" element={<CustomerEstimateDetailPage />} />
            <Route path="projects/:projectId" element={<CustomerProjectDetailPage />} />
            <Route path="bookings" element={<CustomerBookingsPage />} />
            <Route path="bookings/:bookingId" element={<CustomerBookingDetailPage />} />
            <Route path="hire-again" element={<HireAgainPage />} />
            <Route path="messages" element={<CustomerMessagesPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Route>
        <Route element={<RequireRole role="CONTRACTOR" />}>
          <Route path="/app/pro" element={<ProShell />}>
            <Route index element={<ProHomePage />} />
            <Route path="jobs" element={<ProJobsPage />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="opportunities/:opportunityId/estimate" element={<EstimateBuilderPage />} />
            <Route path="opportunities/:opportunityId" element={<OpportunityDetailPage />} />
            <Route path="bookings" element={<ProBookingsPage />} />
            <Route path="bookings/:bookingId" element={<ProBookingDetailPage />} />
            <Route path="estimates" element={<ProEstimatesPage />} />
            <Route path="onboarding" element={<ProOnboardingPage />} />
            <Route path="profile" element={<ProProfilePage />} />
            <Route path="messages" element={<ProMessagesPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Route>
        <Route element={<RequireRole role="VERIFIER" />}>
          <Route path="/app/verifier" element={<VerifierShell />}>
            <Route index element={<VerifierHomePage />} />
            <Route path="visits" element={<VerifierVisitsPage />} />
            <Route path="messages" element={<VerifierMessagesPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Route>
        <Route element={<RequireAdmin />}>
          <Route path="/app/admin" element={<AdminShell />}>
            <Route index element={<AdminHomePage />} />
            <Route path="people" element={<AdminPeoplePage />} />
            <Route path="approvals" element={<AdminApprovalsPage />} />
            <Route path="approvals/:contractorProfileId" element={<AdminApprovalDetailPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
            <Route path="bookings" element={<AdminBookingsPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Route>
      </Route>

      <Route element={<AppShell />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
