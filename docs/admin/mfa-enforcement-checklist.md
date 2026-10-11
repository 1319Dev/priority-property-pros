# Owner checklist: turning on admin MFA

Read this before changing `platform_settings.admin_mfa_required`. This pull request does not change that row. It is 0 in production. Leave it at 0 until the steps below are done by the account owner.

Checked read-only on 2026-10-11 against the live database. No setting was changed.

## What is already in place

- Sign-in codes are Supabase authenticator (TOTP) codes. The admin security page enrolls a device with a QR code or a manual secret, then a 6-digit code. There are no emailed or SMS recovery codes. Supabase does not issue backup codes for this factor. A second authenticator device is the backup.
- The security page refuses to remove a verified device unless the session is already AAL2. While the requirement is on, it also refuses to remove the last verified device.
- `public.is_admin()` is the admin check. It is true only for an ACTIVE profile with account type ADMIN. When `admin_mfa_required` is 1, the signed JWT must also have `aal` = `aal2`. A missing session (`auth.uid()` null, including the service role) is not an admin.
- Public RLS policies that mention admin call `is_admin()`. A live policy scan found none that grant admin access by reading `account_type` directly.
- Admin RPCs for approvals, contact access, portfolio privacy, platform reviews, and account flags call `is_admin()` or `admin_require()` (which calls `is_admin()`).
- Dashboard counts call `admin_require()` before they read. `mark_estimate_viewed` mentions admin only to say an admin must not be counted as the customer viewing an estimate. It does not grant admin.
- The last-admin deletion guard looks at `account_type` inside the service-role purge. It blocks deleting the last admin. It does not let a password session act as admin.
- Contractor approval columns cannot be updated from the client. The trigger allows those columns only inside `admin_approve_contractor`, `admin_reject_contractor`, and `admin_request_contractor_info`.
- Contact grant and revoke writes are allowed only inside their admin RPCs.
- `audit_logs` has RLS, SELECT for signed-in users (the policy still requires `is_admin()`), no INSERT/UPDATE/DELETE grant for anon or authenticated, and triggers that reject update and delete.

## What was true on the live project

- `admin_mfa_required` = 0.
- One ACTIVE admin profile. Zero verified authenticator factors. Turning the flag on today would lock that admin out of every `is_admin()` check, including the pages used to enroll a factor if the gate is enforced before enrollment. Do not flip the flag first.

## What this change adds, still with the flag off

Sensitive actions call `assert_admin_sensitive_step_up()` after the existing admin check:

- approve, reject, and request-info for a contractor
- booking and connection contact grant and revoke
- portfolio photo privacy (also on a direct admin update of `privacy_state`, so the table update is not a bypass)
- platform review update and delete (also on a direct admin write)
- account flags

The check does nothing while the flag is 0. Password-only admin work continues.

When the flag is later set to 1, those actions need a TOTP verification whose JWT `amr` timestamp is within 15 minutes. Refreshing the access token does not extend that window. The newest `amr` entry is often `token_refresh`, so the check looks for `method` = `totp` anywhere in the list, not only the first entry.

Suspensions and refunds are not built. A later function that adds either one must call `is_admin()` and then `assert_admin_sensitive_step_up()`. This checklist is the reminder. Do not add a refund writer here. Platform fees stay non-refundable.

## Before you set the flag to 1

1. Sign in as the admin with the password.
2. Open Admin → Two-factor.
3. Enroll the phone authenticator. Confirm a 6-digit code. The device must show as verified.
4. Enroll a second authenticator on a different device (another phone, a tablet, or a password manager that stores authenticator codes). Confirm that code too. Two verified devices are the recovery path.
5. Sign out. Sign in again and enter a code so the session is AAL2.
6. Open an admin page and confirm it loads. Do not remove either device.
7. Only then run the update below, in the Supabase SQL editor, as the owner. This is not part of a migration.

```sql
UPDATE public.platform_settings
SET value_int = 1, updated_at = now()
WHERE key = 'admin_mfa_required';
```

8. Reload admin. Password-only access should stop. The code screen should appear. Enter the current code from either device.
9. Try one sensitive action, such as opening a contractor decision. If the code is older than 15 minutes, the app asks for a new code and then continues. Cancel leaves the action undone.

## If an admin is locked out

Normal recovery: use the second authenticator. Either verified device can satisfy sign-in and the 15-minute step-up.

If every device is lost, or the flag was turned on before any device was enrolled:

1. Do not delete the auth user. Do not change their role.
2. In the SQL editor, set the flag back to 0:

```sql
UPDATE public.platform_settings
SET value_int = 0, updated_at = now()
WHERE key = 'admin_mfa_required';
```

3. The admin can sign in with the password again, enroll two devices, sign in at AAL2, and only then set the flag back to 1.
4. Write down who ran the break-glass update and when. The settings row itself is not an audit log.

That break-glass update is an owner action in the database. It is not a bypass a signed-in customer can call. `admin_mfa_required()` reads the row. Clients cannot update `platform_settings`.

## Leave alone

- Do not change Stripe, fee amounts, or payment rows as part of turning this on.
- Do not deploy this by editing an old migration. The new migration only adds the check.
- Do not set the flag inside a migration. The owner runs the update after two devices are verified.
