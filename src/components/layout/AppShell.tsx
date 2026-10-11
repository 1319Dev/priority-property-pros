import { Outlet } from "react-router-dom";
import { AgreementAcceptancePrompt } from "../legal/AgreementAcceptancePrompt";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function AppShell() {
  return (
    <div className="paper-grain flex min-h-dvh flex-col">
      <Header />
      <AgreementAcceptancePrompt />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
