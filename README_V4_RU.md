# LTL Secure V4

V4 fixes the Supabase registration flow.

## What changed

- Registration no longer calls `nexus_create_profile()` from the browser.
- A `SECURITY DEFINER` trigger on `auth.users` creates the guest profile server-side.
- The trigger runs even when Supabase Email Confirmation is enabled and `signUp()` returns no session.
- The browser only treats the user as logged in when a real Supabase Auth session exists.
- When email confirmation is required, registration shows **«Проверьте почту»** instead of falsely logging the user in.
- Login and session restoration obtain the profile and role from the protected `nexus_get_my_profile()` RPC rather than trusting localStorage/public cached role data.
- The legacy `nexus_create_profile()` RPC is revoked from client roles.

## Install

1. In Supabase SQL Editor, run the complete `schema_v3_secure.sql` from this V4 package.
2. If you already ran the V3 schema, running the V4 schema again is intended to be safe; it uses `create or replace`, `drop trigger if exists`, and `revoke`.
3. In Supabase Auth settings, keep Email Confirmation enabled or disabled according to your preference.
4. Deploy the V4 directory to GitHub/Vercel.
5. Do not put a `service_role` key in the frontend.

## Expected registration behavior

### Email confirmation ON

`signUp()` creates the Auth user, the database trigger creates the guest profile, and the browser displays:

> Регистрация завершена — Проверьте почту и подтвердите email. После подтверждения войдите в аккаунт.

No fake logged-in state is created.

### Email confirmation OFF

Supabase returns an active session. The browser fetches the profile from `nexus_get_my_profile()` and then opens the site as the newly registered guest.

## Important

The trigger must be installed in the database before relying on the new registration flow. If the trigger is missing, the Auth user may be created without an application profile.
