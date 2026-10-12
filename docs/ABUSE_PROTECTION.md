# Abuse protection (Supabase + app only)

This uses no third-party service: no CAPTCHA vendor and no new accounts. Everything in this PR is off or inert in production until the owner approves each step below.

## What this PR adds

| Layer | What it does | Where |
|---|---|---|
| Honeypot field | Adds a hidden "company website" field to sign-up, sign-in and password reset. People never see it. If a bot fills it, nothing is sent to Supabase and the page shows its normal "done" screen. | `src/components/security/Honeypot.tsx`, `src/lib/security/botGuard.ts` |
| Minimum fill time | Sign-up submitted in under 2.5 s, or password reset in under 1 s, gets a friendly "please press again" message. A second press goes through. Sign-in has no minimum, so password managers still work. | same |
| DB-backed rate limits | Edge functions call `check_rate_limit(bucket, subject, max, window)`. Over the limit, they answer 429 with `Retry-After`. Subjects (user id, IP, email) are stored as SHA-256 hashes only. If the database check itself errors, the request is allowed, so a paying customer is never blocked by a hiccup. | migration `20261020300001`, `supabase/functions/_shared/rateLimit.ts` |
| Before User Created hook | A Postgres function, `public.hook_before_user_created`. It rejects disposable email domains, more than 3 new accounts per IP per hour, and more than 50 new accounts per hour overall. Every decision is logged in `signup_guard_log` (hashed IP and email domain only). If the function has an internal error, it allows the signup and logs the error. **It is not enabled by this PR.** | same migration |

The honeypot and minimum fill time only slow down bots that drive the web page. Bots that call the Supabase Auth API directly are stopped by the hook and by Supabase's own Auth rate limits below.

### Edge function limits

| Function | Limit |
|---|---|
| create-connection-checkout | 10 per user and 30 per IP, per 10 minutes |
| create-signup-fee-checkout | 10 per user per 10 minutes |
| reconcile-connection-checkout, reconcile-signup-fee-checkout | 30 per user per 10 minutes |
| notification-unsubscribe (anonymous) | 30 per IP per 10 minutes |
| Contact form (PR #92), once merged | 5 per IP and 3 per email, per hour (`RATE_LIMITS.contactFormIp` / `contactFormEmail`) |
| Priority Help (PR #83), once merged and turned on | 30 per IP per 10 minutes (`RATE_LIMITS.priorityHelpIp`) |
| delete-account | Not changed here, because PR #90 rewrites that function. Add `RATE_LIMITS.deleteAccountUser` (5 per hour) there. It also limits password guessing through the delete form. |

For #92 and #83, add this at the top of the handler (three lines):

```ts
const limited = await enforceRateLimits(restRpc, [
  { rule: RATE_LIMITS.contactFormIp, subject: clientIp(req) ? `ip:${clientIp(req)}` : null },
  { rule: RATE_LIMITS.contactFormEmail, subject: email ? `email:${email}` : null },
]);
if (limited) return limited;
```

## Owner steps (only after you approve each one)

### 1. Apply the migration and deploy the functions
Apply `20261020300001_abuse_rate_limits_signup_guard.sql`, then deploy these functions:
- `create-connection-checkout`
- `create-signup-fee-checkout`
- `reconcile-connection-checkout`
- `reconcile-signup-fee-checkout`
- `notification-unsubscribe`

This changes no Auth settings.

### 2. Turn on the Before User Created hook (optional, recommended before advertising)
1. Go to Supabase Dashboard → Authentication → **Hooks**.
2. Choose **Before User Created**, then **Postgres function**, schema `public`, function `hook_before_user_created`.
3. Enable it and save.
4. Test: sign up with a `@mailinator.com` address. It should be refused with "Please sign up with a permanent email address…". A normal address should go through.
5. Check what happened in the SQL editor:

```sql
select public.admin_signup_guard_summary(24);
```

To turn it off, disable it on the same screen. Signups go back to normal right away.

### 3. Auth rate limits (Dashboard → Authentication → Rate Limits)

| Setting | Recommended |
|---|---|
| Emails sent (per hour) | 30–60. Only adjustable after custom SMTP is set up; the built-in mailer stays at its low fixed limit. The Gmail SMTP setup is in a separate PR. |
| Sign-ups and sign-ins (per 5 minutes, per IP) | 10–15 |
| Token verifications (per 5 minutes, per IP) | 30 |
| Token refreshes (per 5 minutes, per IP) | leave the default (150) |
| Anonymous sign-ins | leave the default (off, not used) |

### 4. Password security (Dashboard → Authentication → Providers → Email, or Auth → Policies)
- **Minimum password length: 8.** The app already asks for 8. This makes the server enforce it too.
- **Leaked password protection: on.** This rejects passwords found in known breaches, using the HaveIBeenPwned range check that's built into Supabase. No account is needed. If the toggle is greyed out, it needs a paid Supabase plan; leave it off and note it.

### Rollback
- Turn the hook off first (step 2), if it was turned on.
- Redeploy the previous functions.
- Run `supabase/rollbacks/20261020300001_abuse_rate_limits_signup_guard_rollback.sql`.

## Known limits
- Whether a rejected signup's log row is kept depends on how Supabase Auth wraps the hook call. Allowed signups are always counted. Rejections may not be stored if Auth rolls back the request. The limits still work either way, because they count allowed signups.
- Per-IP limits share a budget across people behind the same network (for example, an office or a phone carrier NAT). Three new accounts per hour per IP is generous for real people.
- The disposable-domain list is a seed of about 80 common services. Add more with:

```sql
insert into public.blocked_email_domains(domain, note) values ('example-temp.com', 'manual');
```
