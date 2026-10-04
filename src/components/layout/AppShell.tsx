import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function AppShell() {
  return (
    <div className="paper-grain flex min-h-dvh flex-col">
      <Header />
      <main id="main" className="min-w-0 flex-1">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
