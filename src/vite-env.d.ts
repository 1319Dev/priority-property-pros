/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.css";
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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
