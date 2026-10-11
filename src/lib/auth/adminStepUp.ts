import { ADMIN_STEP_UP_DB_ERROR, ADMIN_STEP_UP_MESSAGE } from "./adminMfa";
import { friendlyAdminError } from "../admin/friendlyAdminError";

type StepUpHandler = () => Promise<boolean>;

let handler: StepUpHandler | null = null;

export class AdminStepUpRequired extends Error {
  constructor() {
    super(ADMIN_STEP_UP_DB_ERROR);
    this.name = "AdminStepUpRequired";
  }
}

export function isAdminStepUpFailure(
  error: { message?: string | null; code?: string | null } | null | undefined,
): boolean {
  return (error?.message ?? "").toLowerCase().includes(ADMIN_STEP_UP_DB_ERROR);
}

/** Admin shell registers the code prompt. Tests and non-admin callers leave this empty. */
export function registerAdminStepUpHandler(next: StepUpHandler | null): void {
  handler = next;
}

export async function requestAdminStepUp(): Promise<boolean> {
  if (!handler) return false;
  return handler();
}

type RpcError = { message: string; code?: string } | null;

/**
 * Runs one sensitive admin RPC. On a step-up error, asks for a fresh code once and retries.
 * While admin MFA is off the database does not raise, so this returns the first result.
 */
export async function runSensitiveAdminCall<T>(
  invoke: () => Promise<{ data: T; error: RpcError }>,
  fallback: string,
  options?: { requireData?: boolean },
): Promise<T> {
  const requireData = options?.requireData !== false;

  const once = async (): Promise<T> => {
    const { data, error } = await invoke();
    if (isAdminStepUpFailure(error)) throw new AdminStepUpRequired();
    if (error || (requireData && (data === null || data === undefined))) {
      throw new Error(friendlyAdminError(error, fallback));
    }
    return data as T;
  };

  try {
    return await once();
  } catch (error) {
    if (!(error instanceof AdminStepUpRequired)) throw error;
    const verified = await requestAdminStepUp();
    if (!verified) throw new Error(ADMIN_STEP_UP_MESSAGE);
    try {
      return await once();
    } catch (retryError) {
      if (retryError instanceof AdminStepUpRequired) throw new Error(ADMIN_STEP_UP_MESSAGE);
      throw retryError;
    }
  }
}

export { ADMIN_STEP_UP_MESSAGE };
