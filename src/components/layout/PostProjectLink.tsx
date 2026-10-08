import type { ComponentProps } from "react";
import { ButtonLink } from "../ui/Button";
import { authAwarePostPath } from "../../lib/auth/publicEntry";
import { useAuth } from "../../lib/auth/useAuth";

export function PostProjectLink({
  to = "/post-project",
  ...props
}: ComponentProps<typeof ButtonLink>) {
  const { loading, account_type } = useAuth();
  return <ButtonLink {...props} to={authAwarePostPath(to, { loading, accountType: account_type })} />;
}
