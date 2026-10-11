/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.css";
declare module "*.md?raw" {
  const src: string;
  export default src;
}
declare module "*.svg";
declare module "*.svg?url" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly VITE_PUBLIC_APP_NAME?: string;
  readonly VITE_PUBLIC_COMPANY_NAME?: string;
  readonly VITE_PUBLIC_SUPPORT_EMAIL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  /** "true" publishes /terms and /privacy. Any other value keeps the drafts off the built site. */
  readonly VITE_PUBLISH_LEGAL_PAGES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
