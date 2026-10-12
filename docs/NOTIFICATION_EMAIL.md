# Notification email: Google Workspace SMTP

`supabase/functions/send-notification` sends notification email through Google Workspace SMTP (`smtp.gmail.com`), signing in as the support mailbox with an app password. Resend is no longer used.

- **Transport:** implicit TLS on port **465**. Supabase Edge Functions block outbound ports 25 and 587 (https://supabase.com/docs/guides/functions/limits), so STARTTLS on 587 is not supported.
- **Code:** a minimal SMTP client in `supabase/functions/_shared/smtp.ts`.
  - It uses `EHLO`, `AUTH PLAIN`, `MAIL FROM` (the authenticated mailbox), `RCPT TO`, `DATA` and `QUIT`.
  - The message is multipart/alternative: text and HTML, both base64 UTF-8.
  - The TLS socket is `Deno.connectTls`, which verifies the server certificate.
  - Each send has a 15-second timeout that includes the connect step.
- **Unchanged behavior:**
  - The `notification_email_log` dedupe claim. A duplicate gets 409 and is skipped. A failed send deletes the claim so a retry can send.
  - The 15-minute message throttle.
  - The `List-Unsubscribe` and `List-Unsubscribe-Post` one-click headers.
  - The email body and footer from `buildNotificationEmail`, including the mailing address from PR #122. The body and footer are carried byte for byte.
- **Not configured means skipped:** if the SMTP secrets are missing or invalid, the function logs `email skipped: <reason>` and still delivers in-app and push notifications.

Supabase Auth email (signup confirmation, password reset, email change) is configured separately in the Supabase Dashboard SMTP settings. It is not affected by this function.

## Secrets (Dashboard → Edge Functions → Secrets)

| Name | Value | Required |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | yes |
| `SMTP_PORT` | `465` (the default if unset; any other value skips email) | no |
| `SMTP_USER` | `support@prioritypropertypros.com` (full address) | yes |
| `SMTP_PASS` | 16-character Google **app password** for that mailbox. Spaces are ignored. | yes |
| `NOTIFICATION_FROM` | e.g. `Priority Property Pros <support@prioritypropertypros.com>` | no |

- **NOTIFICATION_FROM default:** `Priority Property Pros <SMTP_USER>`. A Vault `notification_from` value still takes priority if one exists.
- **Using another From address:** set `NOTIFICATION_FROM` only to the SMTP user itself or a Workspace alias that has been added under Gmail → Settings → Accounts → **Send mail as**. Otherwise Gmail rewrites the From to the signed-in mailbox.
- **Where SMTP secrets are read from:** only from Edge Function secrets. Never put them in the repo, `config.toml`, Vault, or chat.

## Owner setup

1. Turn on 2-Step Verification for `support@prioritypropertypros.com` (myaccount.google.com → Security).
2. Create an app password at https://myaccount.google.com/apppasswords. Name it, e.g., "PPP notifications". Using a separate one from the Supabase Auth SMTP app password lets each be revoked on its own.
3. Add the secrets above.
4. Optional: if you use a `notifications@` alias, first add it in the Admin console (Users → support@ → Add Alternate Emails), then in Gmail under Send mail as.
5. Publish the Google DKIM record (`google._domainkey`) and click Start authentication, for good deliverability.

**Note:** changing the support@ Google password revokes every app password. When that happens, make a new app password and update `SMTP_PASS`.

## Verify after deploy (with approval)

- Trigger one notification for a test account whose email setting is on.
- Check that the function logs show `email sent`.
- Open the message in Gmail → Show original. Expect `spf=pass` and, once DKIM is live, `dkim=pass` and `dmarc=pass`. The `List-Unsubscribe` header should be present.

## Rollback

- **Stop email immediately, no deploy needed:** delete or blank `SMTP_PASS`. Email is skipped; in-app and push notifications keep working.
- **Code rollback:** revert the PR's merge commit and redeploy `send-notification`. The previous version needs `RESEND_API_KEY`. That key was never set in production, so the old code also skips email.
- **No database migration is involved.** `notification_email_log` and Vault are unchanged. The old Vault name `resend_api_key` is simply no longer read.
