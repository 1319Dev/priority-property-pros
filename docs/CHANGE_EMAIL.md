# Change email

Customers and contractors change the email on Account settings. The form asks for the current password, then calls `supabase.auth.updateUser({ email })` with `emailRedirectTo` set to `/auth/callback`. That callback is already allow-listed.

`updateUser` does not change `auth.users.email` until the confirmation links are completed. With **Secure email change** on, Auth emails both the current address and the new one. `profiles.email` is copied from `auth.users.email` by the trigger in `supabase/migrations/20261017000002_sync_profile_email_from_auth.sql` after that commit. The app does not update `profiles.email` from the browser. `protect_profile_columns` still rejects a client email write, a role change, and a signup-fee change.

This migration is not applied to production by the pull request. Apply it only when you are ready, with the Supabase CLI against the project, after you have read the SQL.

## Owner steps

1. In the Supabase Dashboard, open Authentication → [Providers → Email](https://supabase.com/dashboard/project/bersftkjpbzpgtahbqwd/auth/providers?provider=Email) and confirm **Secure email change** (`mailer_secure_email_change_enabled`) is on. Leave it on. Do not flip it as part of reviewing this change.
2. Custom SMTP is not set up. The built-in provider only delivers to organization team addresses and is limited to 2 emails per hour ([custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)). Confirmation mail for a real customer or contractor will not arrive until SMTP is configured. Resend is the intended provider and is not connected yet. Do not put that status on the public account page.
3. After SMTP works, apply `20261017000002_sync_profile_email_from_auth.sql`. Do not apply it before you want `profiles.email` to follow Auth. Rollback is `supabase/rollbacks/20261017000002_sync_profile_email_from_auth_rollback.sql`.
4. The Change email address template can use `{{ .NewEmail }}`. The default template is enough. Edit it under Authentication → Emails only if you want different wording.

The account page shows a pending address from `user.new_email` while Auth is waiting. Signing in again loads the new address after both confirmations, and the auth listener reloads the profile on `USER_UPDATED`.
