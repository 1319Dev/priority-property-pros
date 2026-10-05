import { getSupabaseClient } from "../supabase/client";
import {
  customerFacingShareError,
  sanitizeSharedContact,
  type ContactShareAudience,
  type SharedContactView,
} from "./contactShare";

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

export async function getSharedProjectContact(
  projectId: string,
  contractorProfileId: string,
  audience: ContactShareAudience,
): Promise<SharedContactView> {
  const { data, error } = await client().rpc("get_shared_project_contact", {
    p_project_id: projectId,
    p_contractor_profile_id: contractorProfileId,
  });
  if (error) throw new Error(customerFacingShareError(error.message));
  return sanitizeSharedContact(data, audience);
}

export async function shareProjectContact(
  projectId: string,
  contractorProfileId: string,
): Promise<SharedContactView> {
  const { data, error } = await client().rpc("share_project_contact", {
    p_project_id: projectId,
    p_contractor_profile_id: contractorProfileId,
  });
  if (error) throw new Error(customerFacingShareError(error.message));
  return sanitizeSharedContact(data, "customer");
}
