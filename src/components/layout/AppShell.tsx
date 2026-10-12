import { Outlet, useLocation } from "react-router-dom";
import { AgreementAcceptancePrompt } from "../legal/AgreementAcceptancePrompt";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { Header } from "./Header";

/** The activation page shows the prompt inline, next to the $9.99 button, instead of this banner. */
const INLINE_AGREEMENT_PROMPT_PATHS: readonly string[] = ["/account/activate"];

export function AppShell() {
  const { pathname } = useLocation();
  const inline = INLINE_AGREEMENT_PROMPT_PATHS.includes(pathname.replace(/\/+$/, ""));
  return (
    <div className="paper-grain flex min-h-dvh flex-col">
      <Header />
      {inline ? null : <AgreementAcceptancePrompt />}
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
