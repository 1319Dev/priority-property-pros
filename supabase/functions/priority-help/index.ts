import { handlePriorityHelp } from "../_shared/priorityHelp/handler.ts";
import { restRpc, userIdFromRequest } from "../_shared/supabase.ts";

// Guests have no user JWT. verify_jwt is false in config.toml.
// This function checks a user JWT itself and ignores any user id in the body.
// The service-role key stays in the function environment. It is never returned.

Deno.serve((req) =>
  handlePriorityHelp(req, {
    env: (key) => Deno.env.get(key),
    rpc: restRpc,
    fetchImpl: fetch,
    userIdFromAuthorization: async (authorization) => {
      try {
        return await userIdFromRequest(new Request("https://priority-help.local", { headers: { Authorization: authorization } }));
      } catch {
        return null;
      }
    },
  }),
);
