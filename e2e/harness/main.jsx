import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "../../src/App";
import { ToastProvider } from "../../src/components/ui/Toast";
import { AuthProvider } from "../../src/lib/auth/AuthProvider";
import "../../src/index.css";
import { DirectoryPreview } from "./directoryPreview";
import { HelpPreview } from "./priorityHelpPreview";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root is missing");

const previewParams = new URLSearchParams(window.location.search);
const preview = previewParams.get("preview");
const helpScene = previewParams.get("scene") || "open";

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      {preview === "directory" || preview === "storefront" ? (
        <AuthProvider>
          <DirectoryPreview view={preview} />
        </AuthProvider>
      ) : preview === "help" ? (
        <AuthProvider>
          <HelpPreview scene={helpScene} />
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
