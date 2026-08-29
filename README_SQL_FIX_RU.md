# LTL V2.9 — исправление SQL

Ошибка на скриншоте:
`ERROR 42883: operator does not exist: text = uuid`

Причина: в этой конфигурации Supabase `storage.objects.owner_id` имеет тип `text`,
а `auth.uid()` возвращает `uuid`.

В `schema_v3_secure.sql` исправлено сравнение на:
`owner_id = auth.uid()::text`

Запускай `schema_v3_secure.sql` целиком в SQL Editor.

Если SQL Editor показывает старый текст запроса, создай новый Query,
открой файл и вставь именно содержимое актуального `schema_v3_secure.sql`.
Не смешивай его со старыми V2.6/V2.7/V2.8 SQL.
