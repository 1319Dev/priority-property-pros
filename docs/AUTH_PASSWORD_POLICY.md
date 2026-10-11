# Password length for Priority Property Pros

The signup and reset forms already ask for at least 8 characters. Supabase Auth’s hosted default is 6. A password of 6 or 7 characters can be created by calling `POST /auth/v1/signup` directly, and this app never sees that request.

## What this repository enforces

`src/lib/auth/passwordPolicy.ts` rejects passwords shorter than 8 characters inside `AuthProvider.signUp` and `AuthProvider.updatePassword`. The reset page uses the same check before it asks Auth to save a new password.

That check does not run for a direct Auth API call. `auth.users` stores a bcrypt hash, so a database trigger cannot measure the password. The before-user-created Auth hook payload does not include the password either.

This repository does not put an `[auth]` block in `supabase/config.toml`. That file only sets Edge Function `verify_jwt` flags. Pushing a full Auth config from it could change hosted Auth settings.

Character-class rules (digit, upper case, symbol) stay off. The forms only say “at least 8 characters.” Turning classes on in the dashboard before the forms list them would reject passwords the UI still accepts.

## Owner steps (dashboard only)

Do this in the Supabase Dashboard for project `bersftkjpbzpgtahbqwd`. Do not enable it from a migration or from `config.toml`.

1. Open [Authentication → Providers → Email](https://supabase.com/dashboard/project/bersftkjpbzpgtahbqwd/auth/providers?provider=Email).
2. Set **Minimum password length** to **8**.
3. Leave required character classes unset.
4. Save.

After that, Auth rejects a shorter password on signup and on password update, including calls that skip this app.

## Leaked-password protection

Supabase can reject passwords that appear in the HaveIBeenPwned list. The [password security guide](https://supabase.com/docs/guides/auth/password-security) says this is available on the Pro plan and above.

Leave it off for this change. Confirm the project’s current plan and the current Pro price on the [Supabase pricing page](https://supabase.com/pricing) before turning it on. If the project is already on Pro, the guide does not describe a separate add-on fee for the check. If the project is on the Free plan, turning it on requires a Pro upgrade.

Do not enable leaked-password protection until you have confirmed the plan. Do not add character-class requirements in the same step.
