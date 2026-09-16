import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function AppShell() {
  return (
    <div className="paper-grain flex min-h-dvh flex-col">
      <Header />
      <main id="main" className="flex-1 pb-32 lg:pb-0">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
