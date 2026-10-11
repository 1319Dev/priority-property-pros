# Signup and sign-in abuse protection

This note is for the owner. It does not turn anything on. Do not enable CAPTCHA in the Supabase Dashboard until a later change adds a widget that sends `captchaToken`. If the dashboard toggle is on and the forms do not send a token, signup and sign-in fail for everyone.

Built-in Auth rate limits are already on. They are part of Supabase Auth and are not a separate paid add-on. CAPTCHA verification inside Supabase is not an extra Supabase charge. The CAPTCHA vendor may have its own plan. Confirm that price on the vendor’s site before creating a widget.

## Rate limits already in place

Source: [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), read October 2026. Change them only under Authentication → [Rate Limits](https://supabase.com/dashboard/project/bersftkjpbzpgtahbqwd/auth/rate-limits).

| Operation | Default |
| --- | --- |
| Sign-ups and sign-ins (`/auth/v1/signup`, recover, resend, magiclink, otp, user) | 30 requests per 5 minutes per IP, bursts up to 30. Excludes anonymous sign-ins. |
| Token endpoint (`/auth/v1/token`, including password grant) | 150 requests per 5 minutes per IP, bursts up to 30. |
| Verification (`/auth/v1/verify`) | 30 requests per 5 minutes per IP, bursts up to 30. |
| Signup confirmation, password reset, and OTP or magic link to the same user | 60 seconds between requests. |
| Emails from the built-in SMTP provider | 2 emails per hour. |
| Anonymous sign-ins | 30 per hour per IP. This app does not use them. |

The built-in email provider only delivers to addresses on the Supabase organization team. That is why customer and contractor mail needs custom SMTP. Resend is not set up on this project yet. Until it is, confirmation and email-change messages will not reach people outside the team.

After custom SMTP is saved, Supabase starts that provider at a low limit (the SMTP guide describes 30 messages per hour) so a new domain is not burned. Raise `rate_limit_email_sent` only as delivery looks healthy. Do not set it to unlimited.

Leave IP address forwarding off. It needs a secret API key, not the publishable or anon key, and this site calls Auth from the browser.

## CAPTCHA later, not now

Dashboard path: Authentication → [Bot and Abuse Protection](https://supabase.com/dashboard/project/bersftkjpbzpgtahbqwd/auth/protection) → Enable CAPTCHA protection.

Supabase accepts hCaptcha or Cloudflare Turnstile. Prefer Turnstile when a widget is added later. Turnstile’s typical site widget is free; hCaptcha has a free publisher plan. Confirm the current vendor price before signing up. Supabase itself does not add a fee for the CAPTCHA toggle.

Recommended order, when the owner wants it:

1. Create a Turnstile widget and allow `prioritypropertypros.com` plus local testing hosts.
2. Ship a frontend change that passes `options.captchaToken` on sign-up, sign-in, and password reset.
3. Only then paste the secret key in the dashboard and turn the toggle on.

Do not install a CAPTCHA package or enable the toggle in the current work.
