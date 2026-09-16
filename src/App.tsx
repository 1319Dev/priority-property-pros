import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAdmin, RequireAuth, RequireRole } from "./lib/auth/guards";
import { BecomeAProPage } from "./pages/BecomeAProPage";
import { FindAProPage } from "./pages/FindAProPage";
import { HomePage } from "./pages/HomePage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { NotFoundPage } from "./pages/NotFoundPage";
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
import { ProHomePage, ProJobsPage, ProMessagesPage } from "./pages/app/ProPages";
import { VerifierHomePage, VerifierMessagesPage, VerifierVisitsPage } from "./pages/app/VerifierPages";
import {
  AdminApprovalsPage,
  AdminAuditPage,
  AdminHomePage,
  AdminPeoplePage,
} from "./pages/app/AdminPages";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/find-a-pro" element={<FindAProPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
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
            <Route path="messages" element={<CustomerMessagesPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Route>
        <Route element={<RequireRole role="CONTRACTOR" />}>
          <Route path="/app/pro" element={<ProShell />}>
            <Route index element={<ProHomePage />} />
            <Route path="jobs" element={<ProJobsPage />} />
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
            <Route path="audit" element={<AdminAuditPage />} />
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
