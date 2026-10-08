import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../ui/Button";
import { authAwarePostPath, dashboardPath } from "../../lib/auth/publicEntry";
import { useAuth } from "../../lib/auth/useAuth";
import { cn } from "../../utils/cn";

function useViewer() {
  const auth = useAuth();
  return {
    loading: auth.loading,
    accountType: auth.account_type,
    contractor: !auth.loading && auth.account_type === "CONTRACTOR",
    home: dashboardPath({
      accountType: auth.account_type,
      accountStatus: auth.account_status,
      signupFeeEnabled: auth.signup_fee_enabled,
      signupFeeStatus: auth.signup_fee_status,
    }),
  };
}

const reserve = {
  lg: "min-h-14 min-w-44",
  md: "min-h-12 min-w-36",
  sm: "min-h-11 min-w-28",
} as const;

/** Pro-signup button. Contractors get My dashboard. Loading reserves the same slot. */
export function ContractorEntryLink({
  to = "/become-a-pro",
  children,
  size = "md",
  className,
  variant,
}: ComponentProps<typeof ButtonLink>) {
  const { loading, contractor, home } = useViewer();
  if (loading) {
    return <span className={cn("inline-flex shrink-0", reserve[size])} aria-hidden="true" />;
  }
  if (contractor) {
    return (
      <ButtonLink to={home} size={size} variant={variant} className={className}>
        My dashboard
      </ButtonLink>
    );
  }
  return (
    <ButtonLink to={to} size={size} variant={variant} className={className}>
      {children}
    </ButtonLink>
  );
}

export function PostProjectTextLink({
  to = "/post-project",
  className,
  children,
}: {
  to?: string;
  className?: string;
  children: ReactNode;
}) {
  const { loading, accountType } = useViewer();
  return (
    <Link to={authAwarePostPath(to, { loading, accountType })} className={className}>
      {children}
    </Link>
  );
}
