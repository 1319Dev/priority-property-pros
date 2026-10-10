import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "../../src/App";
import { ToastProvider } from "../../src/components/ui/Toast";
import { AuthProvider } from "../../src/lib/auth/AuthProvider";
import "../../src/index.css";
import { DirectoryPreview } from "./directoryPreview";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root is missing");

const preview = new URLSearchParams(window.location.search).get("preview");

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      {preview === "directory" || preview === "storefront" ? (
        <AuthProvider>
          <DirectoryPreview view={preview} />
        </AuthProvider>
      ) : (
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      )}
    </HashRouter>
  </StrictMode>,
);
