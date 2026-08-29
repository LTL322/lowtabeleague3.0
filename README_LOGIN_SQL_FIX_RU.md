# LTL FINAL V5 — исправлен SQL входа

Исправлена синтаксическая ошибка в `nexus_resolve_login`.
Причина была в некорректно экранированных кавычках вокруг JSON-ключей
`username` и `authUserId`.

Вход:
- логин/никнейм -> серверный `nexus_resolve_login`;
- пароль -> только Supabase Auth;
- email тоже поддерживается.

Важно: запускайте только `schema_v3_secure.sql` из этого архива.
