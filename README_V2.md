# LTL Secure V2

## What changed
- Application state is centralized in `public.nexus_users` as key/value JSONB.
- Direct SELECT/INSERT/UPDATE/DELETE access to `public.nexus_users` is revoked for `anon` and `authenticated`.
- The browser reads/writes through SECURITY DEFINER RPC functions.
- Shared application data is kept in memory, not persistent `localStorage`.
- Supabase Auth remains the password store; passwords are never written to `nexus_users`.
- A normal user can update only their own avatar fields.
- Admin/head can write application state through the protected RPC.
- Realtime row payloads are not used for the main state; the client polls the protected RPC every 15 seconds.
- `ltl_state` is retained as a rollback backup during migration and is not used by V2 frontend code for normal state sync.

## Install
1. Open Supabase SQL Editor.
2. Run `schema_v2.sql` once.
3. Verify the RPCs finish successfully.
4. Deploy this directory to GitHub/Vercel.
5. Do not add a service-role key anywhere in the repository.

## Important security limitation
If a visitor is allowed to see a piece of site data in the browser, that data can be inspected in DevTools/network tools. V2 prevents direct database-table access and keeps shared state out of persistent localStorage, but it cannot make data invisible to a browser that must render it.

## Rollback
Do not delete `ltl_state` until V2 has been tested. `schema_v2.sql` copies the existing state into `nexus_users` but intentionally leaves the old table untouched.


## V3 security hardening
See `SECURITY_INSTALL_RU.md` and run `schema_v3_secure.sql` after V2. V3 makes full state staff-only server-side, binds staff checks to auth.uid(), closes direct table access, and adds Storage policies.
