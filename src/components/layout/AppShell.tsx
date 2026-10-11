import { Outlet } from "react-router-dom";
import { PriorityHelp } from "../support/PriorityHelp";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function AppShell() {
  return (
    <div className="paper-grain flex min-h-dvh flex-col">
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
      <PriorityHelp />
    </div>
  );
}
