# Установка LTL SECURE V5

1. Загрузите содержимое сборки в корень GitHub-репозитория.
2. В Supabase → SQL Editor выполните `schema_v3_secure.sql` целиком.
3. В Supabase → Authentication → URL Configuration добавьте адрес GitHub Pages.
4. Регистрация на сайте требует никнейм, действующий email и пароль.
5. Не публикуйте service_role key. В `supabase-config.js` должен находиться только publishable/anon key.
