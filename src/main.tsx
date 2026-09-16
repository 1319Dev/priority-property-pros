import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./lib/auth/AuthProvider";
import "./index.css";
import { routerBasename } from "./utils/cn";

if (import.meta.env.MODE !== "test") {
  void import("./pwa");
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root is missing");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename()}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
