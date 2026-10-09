import { captureRecoveryLink } from "./recoveryLink";

// Module side effect imported first from main.tsx, before the PKCE client exists.
captureRecoveryLink(window.location.search, window.location.hash);
