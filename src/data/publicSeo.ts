export const SITE_ORIGIN = "https://prioritypropertypros.com";

export type PublicMeta = {
  title: string;
  description: string;
  /** index,follow or noindex,follow */
  robots: "index,follow" | "noindex,follow";
};

const HOME_TITLE = "Priority Property Pros | Your project. Local pros. Your choice.";
const HOME_DESCRIPTION =
  "Post a project, compare estimates from local independent contractors, and hire who you choose. $9.99 one-time account activation. Contractors pay $4.99 only when they connect.";

const EXACT_META: Record<string, PublicMeta> = {
  "/": { title: HOME_TITLE, description: HOME_DESCRIPTION, robots: "index,follow" },
  "/find-a-pro": {
    title: "Reviewed contractors | Priority Property Pros",
    description:
      "See contractors only after a customer reviews them on Priority Property Pros. This is not a directory. Contact details stay hidden until a contractor connects.",
    robots: "index,follow",
  },
  "/how-it-works": {
    title: "How it works | Priority Property Pros",
    description:
      "Post the work, compare up to three local estimates, and hire the contractor you choose. Priority Property Pros is the marketplace, not the crew.",
    robots: "index,follow",
  },
  "/pricing": {
    title: "Pricing | Priority Property Pros",
    description:
      "$9.99 one-time account activation for homeowners and contractors. $4.99 only when a contractor chooses to connect. No monthly fee. The customer pays the contractor directly.",
    robots: "index,follow",
  },
  "/become-a-pro": {
    title: "Join as a pro | Priority Property Pros",
    description:
      "Set your service area and the work you want, then browse local opportunities. $9.99 one-time activation. Pay $4.99 only when you choose to connect. Jobs are not guaranteed.",
    robots: "index,follow",
  },
  "/faq": {
    title: "FAQ | Priority Property Pros",
    description:
      "Answers about posting a project, contractor connections, the $9.99 account activation, and the $4.99 connection fee.",
    robots: "index,follow",
  },
  "/contact": {
    title: "Contact | Priority Property Pros",
    description:
      "Questions about the Priority Property Pros marketplace. Job payment and workmanship stay between you and the contractor you hire.",
    robots: "index,follow",
  },
  "/reviews": {
    title: "Reviews | Priority Property Pros",
    description:
      "Reviews of the Priority Property Pros marketplace from signed-in users. No invented testimonials.",
    robots: "index,follow",
  },
  "/trust": {
    title: "Trust and safety | Priority Property Pros",
    description:
      "Approved platform profiles, contractor-entered trades, and hidden contact details until a connection unlocks. PPP does not verify licenses, insurance, or workmanship.",
    robots: "index,follow",
  },
  "/post-project": {
    title: "Post a project | Priority Property Pros",
    description:
      "Sign in as a customer to post a project. Local independent contractors can send estimates. You choose who to hire.",
    robots: "index,follow",
  },
  "/sign-in": {
    title: "Sign in | Priority Property Pros",
    description: "Sign in to post a project or manage your contractor account on Priority Property Pros.",
    robots: "noindex,follow",
  },
  "/sign-up": {
    title: "Create an account | Priority Property Pros",
    description:
      "Create a homeowner, contractor, or verifier account. One-time $9.99 account activation. Not a monthly subscription.",
    robots: "noindex,follow",
  },
  "/forgot-password": {
    title: "Reset password | Priority Property Pros",
    description: "Request a password reset email for your Priority Property Pros account.",
    robots: "noindex,follow",
  },
  "/auth/reset-password": {
    title: "Choose a new password | Priority Property Pros",
    description: "Set a new password for your Priority Property Pros account.",
    robots: "noindex,follow",
  },
  "/auth/verify": {
    title: "Verify email | Priority Property Pros",
    description: "Confirm your email to finish creating a Priority Property Pros account.",
    robots: "noindex,follow",
  },
  "/auth/callback": {
    title: "Signing in | Priority Property Pros",
    description: "Finishing sign-in for Priority Property Pros.",
    robots: "noindex,follow",
  },
  "/account/status": {
    title: "Account status | Priority Property Pros",
    description: "Check the status of your Priority Property Pros account.",
    robots: "noindex,follow",
  },
  "/account/activate": {
    title: "Activate account | Priority Property Pros",
    description: "Activate your Priority Property Pros account after email verification.",
    robots: "noindex,follow",
  },
};

const SIGN_UP_ROLE_META: Record<string, PublicMeta> = {
  customer: {
    title: "Customer account | Priority Property Pros",
    description:
      "Create a customer account to post a project. One-time $9.99 account activation. No monthly fee and no connection fee for customers.",
    robots: "noindex,follow",
  },
  contractor: {
    title: "Contractor account | Priority Property Pros",
    description:
      "Create a contractor account, set your trades and service area, and browse opportunities. Pay $4.99 only when you choose to connect.",
    robots: "noindex,follow",
  },
  verifier: {
    title: "Verifier account | Priority Property Pros",
    description:
      "Create a verifier account. One-time $9.99 account activation. This is not a workmanship inspection.",
    robots: "noindex,follow",
  },
};

export function normalizePublicPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function isContractorDetailPath(pathname: string): boolean {
  return /^\/find-a-pro\/[^/]+$/.test(normalizePublicPath(pathname));
}

export function resolvePublicMeta(pathname: string): PublicMeta & { canonicalPath: string } {
  const path = normalizePublicPath(pathname);
  const exact = EXACT_META[path];
  if (exact) return { ...exact, canonicalPath: path };
  const role = path.match(/^\/sign-up\/([^/]+)$/)?.[1];
  if (role && SIGN_UP_ROLE_META[role]) {
    return { ...SIGN_UP_ROLE_META[role], canonicalPath: path };
  }
  if (path.startsWith("/app/")) {
    return {
      title: "Account | Priority Property Pros",
      description: "Signed-in account area for Priority Property Pros.",
      robots: "noindex,follow",
      canonicalPath: path,
    };
  }
  if (isContractorDetailPath(path)) {
    return {
      title: "Reviewed contractor | Priority Property Pros",
      description:
        "A contractor with a customer review on Priority Property Pros. Contact details stay hidden. This is not a public directory.",
      robots: "index,follow",
      canonicalPath: path,
    };
  }
  return {
    title: "Page not found | Priority Property Pros",
    description: "That page is not on Priority Property Pros.",
    robots: "noindex,follow",
    canonicalPath: path,
  };
}

export function canonicalUrl(pathname: string): string {
  const path = normalizePublicPath(pathname);
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}

export function indexablePublicPaths(): string[] {
  return Object.entries(EXACT_META)
    .filter(([, meta]) => meta.robots === "index,follow")
    .map(([path]) => path);
}

export function applyPublicMeta(meta: PublicMeta & { canonicalPath: string }): void {
  const canonical = canonicalUrl(meta.canonicalPath);
  document.title = meta.title;
  upsertMeta("name", "description", meta.description);
  upsertMeta("property", "og:title", meta.title);
  upsertMeta("property", "og:description", meta.description);
  upsertMeta("property", "og:url", canonical);
  upsertMeta("name", "twitter:title", meta.title);
  upsertMeta("name", "twitter:description", meta.description);
  upsertMeta("name", "robots", meta.robots);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = canonical;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
