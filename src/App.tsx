import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { BecomeAProPage } from "./pages/BecomeAProPage";
import { FindAProPage } from "./pages/FindAProPage";
import { HomePage } from "./pages/HomePage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PostProjectPage } from "./pages/PostProjectPage";
import { SignInPage } from "./pages/SignInPage";
import { TrustPage } from "./pages/TrustPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/find-a-pro" element={<FindAProPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/become-a-pro" element={<BecomeAProPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/post-project" element={<PostProjectPage />} />
        <Route path="/trust" element={<TrustPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
