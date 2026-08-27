# Security hardening applied

This package is a hardened revision of the supplied project.

Changes:
- Restricted `ltl-media` object update/delete policies to staff users.
- Removed `unsafe-inline` from the CSP where it was present.
- Preserved the existing application structure and Supabase client configuration.
- Added this security review note.

Important:
- Review the generated CSP in a staging deployment before production. If the application relies on inline event handlers or inline styles/scripts, migrate them to external assets or replace CSP directives with nonce/hash-based policies.
- Supabase `anon`/publishable keys may be public; never put a `service_role` key in frontend code.
- File MIME/type/size validation should also be enforced server-side or through storage rules.
