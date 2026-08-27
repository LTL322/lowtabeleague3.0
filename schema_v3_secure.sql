-- LTL Secure V3
-- Security hardening for Supabase/Postgres.
-- IMPORTANT: execute after the existing V2 migration has been applied.
-- Never put a service_role key in the frontend.

create table if not exists public.nexus_users (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nexus_users enable row level security;
revoke all on table public.nexus_users from public, anon, authenticated;

-- Helper: resolve the authenticated user to the profile by immutable auth user id.
create or replace function public.ltl_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.value
      from public.nexus_users n
      cross join lateral jsonb_each(coalesce(n.value_json, '{}'::jsonb)) e(key, value)
      where n.key = 'nexus_users'
        and (e.value->>'authUserId') = auth.uid()::text
      limit 1
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.ltl_my_profile() from public, anon;
grant execute on function public.ltl_my_profile() to authenticated;

create or replace function public.ltl_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.ltl_my_profile()->>'role') in ('admin','head'), false);
$$;

revoke all on function public.ltl_is_staff() from public, anon;
grant execute on function public.ltl_is_staff() to authenticated;

-- Private/full state: authenticated staff only. Even if a visitor edits
-- localStorage and claims to be admin, this function rejects the request.
create or replace function public.nexus_get_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.ltl_is_staff() then
    raise exception 'staff access required';
  end if;

  return coalesce(
    (select jsonb_object_agg(key, value_json) from public.nexus_users),
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.nexus_get_state() from public, anon, authenticated;
grant execute on function public.nexus_get_state() to authenticated;

-- Public state excludes private profile and support-message stores.
create or replace function public.nexus_get_public_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value_json), '{}'::jsonb)
  from public.nexus_users
  where key not in ('nexus_users', 'nexus_support_messages');
$$;

revoke all on function public.nexus_get_public_state() from public;
grant execute on function public.nexus_get_public_state() to anon, authenticated;

-- Public directory contains only intentionally public profile fields.
create or replace function public.nexus_get_user_directory()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(lower(e.key),
    jsonb_build_object(
      'username', e.value->>'username',
      'role', coalesce(e.value->>'role','guest'),
      'teamId', e.value->'teamId',
      'createdAt', e.value->'createdAt',
      'avatar', e.value->'avatar',
      'avatar_url', e.value->'avatar_url'
    )), '{}')
  from public.nexus_users n
  cross join lateral jsonb_each(coalesce(n.value_json, '{}'::jsonb)) e(key,value)
  where n.key = 'nexus_users';
$$;

revoke all on function public.nexus_get_user_directory() from public;
grant execute on function public.nexus_get_user_directory() to anon, authenticated;

-- Own profile only.
create or replace function public.nexus_get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.ltl_my_profile();
$$;

revoke all on function public.nexus_get_my_profile() from public, anon;
grant execute on function public.nexus_get_my_profile() to authenticated;

-- Staff-only writes.
create or replace function public.nexus_set_state(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.ltl_is_staff() then
    raise exception 'staff access required';
  end if;

  if p_key is null or length(trim(p_key)) = 0 or length(p_key) > 100 then
    raise exception 'invalid state key';
  end if;

  insert into public.nexus_users(key, value_json, updated_at)
  values (p_key, coalesce(p_value, '{}'::jsonb), now())
  on conflict (key) do update
    set value_json = excluded.value_json, updated_at = now();
end;
$$;

revoke all on function public.nexus_set_state(text,jsonb) from public, anon, authenticated;
grant execute on function public.nexus_set_state(text,jsonb) to authenticated;

create or replace function public.nexus_delete_state(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.ltl_is_staff() then
    raise exception 'staff access required';
  end if;
  delete from public.nexus_users where key = p_key;
end;
$$;

revoke all on function public.nexus_delete_state(text) from public, anon, authenticated;
grant execute on function public.nexus_delete_state(text) to authenticated;

-- A normal user may change only avatar fields of their own profile.
create or replace function public.nexus_update_my_profile(p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_map jsonb;
  old_profile jsonb;
  clean_old jsonb;
  clean_new jsonb;
  username_key text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  username_key := lower(coalesce(public.ltl_my_profile()->>'username',''));
  if username_key = '' then raise exception 'profile not found'; end if;

  select coalesce(value_json, '{}'::jsonb) into current_map
  from public.nexus_users where key = 'nexus_users' for update;

  old_profile := coalesce(current_map->username_key, '{}'::jsonb);
  clean_old := old_profile - 'avatar' - 'avatar_url';
  clean_new := coalesce(p_profile, '{}'::jsonb) - 'avatar' - 'avatar_url';

  if clean_old is distinct from clean_new then
    raise exception 'only avatar fields can be changed';
  end if;

  current_map := jsonb_set(
    current_map,
    array[username_key],
    jsonb_build_object(
      'username', old_profile->>'username',
      'email', old_profile->>'email',
      'role', old_profile->>'role',
      'teamId', old_profile->'teamId',
      'createdAt', old_profile->'createdAt',
      'avatar', coalesce(p_profile->'avatar', 'null'::jsonb),
      'avatar_url', coalesce(p_profile->'avatar_url', 'null'::jsonb),
      'authUserId', old_profile->'authUserId'
    ),
    true
  );

  update public.nexus_users
  set value_json = current_map, updated_at = now()
  where key = 'nexus_users';
end;
$$;

revoke all on function public.nexus_update_my_profile(jsonb) from public, anon;
grant execute on function public.nexus_update_my_profile(jsonb) to authenticated;

-- Legacy profile-creation RPC. V4 registration no longer calls this from the browser;
-- the auth.users trigger below creates profiles server-side, including email-confirmation flows.
create or replace function public.nexus_create_profile(
  p_user_id uuid,
  p_username text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := lower(trim(p_username));
  current_map jsonb;
  profile jsonb;
begin
  if auth.uid() is null or p_user_id <> auth.uid() then
    raise exception 'authentication required';
  end if;

  if k = '' or length(k) > 40 or p_email is null or position('@' in p_email) < 2 then
    raise exception 'invalid profile';
  end if;

  if exists (
    select 1 from public.nexus_users n
    where n.key = 'nexus_users' and n.value_json ? k
  ) then
    raise exception 'username already exists';
  end if;

  select coalesce(value_json, '{}'::jsonb) into current_map
  from public.nexus_users where key = 'nexus_users' for update;

  profile := jsonb_build_object(
    'username', p_username,
    'email', p_email,
    'role', 'guest',
    'teamId', null,
    'createdAt', now(),
    'avatar', null,
    'authUserId', p_user_id
  );

  insert into public.nexus_users(key, value_json, updated_at)
  values ('nexus_users', jsonb_build_object(k, profile), now())
  on conflict (key) do update
    set value_json = public.nexus_users.value_json || jsonb_build_object(k, profile),
        updated_at = now();
end;
$$;

revoke all on function public.nexus_create_profile(uuid,text,text) from public, anon, authenticated;
grant execute on function public.nexus_create_profile(uuid,text,text) to authenticated;

-- Username -> email resolution is required by the current UI.
-- It intentionally returns only the email for the exact username match.
-- Protect it from bulk anonymous use with Supabase/Cloudflare rate limits.
create or replace function public.nexus_resolve_login(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.value->>'email'
  from public.nexus_users n
  cross join lateral jsonb_each(coalesce(n.value_json, '{}'::jsonb)) e(key,value)
  where n.key = 'nexus_users'
    and lower(e.key) = lower(trim(p_username))
  limit 1;
$$;

revoke all on function public.nexus_resolve_login(text) from public;
grant execute on function public.nexus_resolve_login(text) to anon, authenticated;

-- Health check does not reveal table contents.
create or replace function public.nexus_storage_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'storage_table', to_regclass('public.nexus_users') is not null,
    'rls_enabled', coalesce((select relrowsecurity from pg_class where oid = 'public.nexus_users'::regclass), false)
  );
$$;

revoke all on function public.nexus_storage_health() from public;
grant execute on function public.nexus_storage_health() to anon, authenticated;

-- Storage hardening.
-- These policies assume the bucket "ltl-media" already exists.
-- Run only if you want uploads restricted to authenticated users.
drop policy if exists "ltl_media_insert_auth" on storage.objects;
create policy "ltl_media_insert_auth"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ltl-media'
  and (
    public.ltl_is_staff()
    or (
      (storage.foldername(name))[1] = 'avatars'
      and lower(storage.extension(name)) in ('png','jpg','jpeg','webp')
    )
  )
);

drop policy if exists "ltl_media_update_auth" on storage.objects;
create policy "ltl_media_update_staff"
on storage.objects
for update
to authenticated
using (bucket_id = 'ltl-media' and public.ltl_is_staff())
with check (bucket_id = 'ltl-media' and public.ltl_is_staff());

drop policy if exists "ltl_media_delete_auth" on storage.objects;
create policy "ltl_media_delete_staff"
on storage.objects
for delete
to authenticated
using (bucket_id = 'ltl-media' and public.ltl_is_staff());

-- Public reads are intentionally allowed only if the bucket is public,
-- because the existing frontend uses /object/public/ URLs for images.
-- If you want private media, replace the frontend with signed URLs.

-- V4 registration fix:
-- Create the application profile from auth.users server-side.
-- This runs even when Supabase requires email confirmation and no Auth session
-- is returned to the browser after signUp().
create or replace function public.nexus_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  email_local text := split_part(coalesce(new.email, ''), '@', 1);
  k text;
  current_map jsonb;
  profile jsonb;
begin
  -- Dashboard-created users may not have username metadata. Use the email local-part as a safe fallback.
  k := lower(regexp_replace(coalesce(nullif(requested_username, ''), email_local), '[^a-zA-Z0-9_\-]+', '_', 'g'));
  k := left(k, 40);
  if k = '' or length(k) < 2 then
    raise exception 'username is required';
  end if;

  if position('@' in coalesce(new.email, '')) < 2 then
    raise exception 'valid email is required';
  end if;

  if exists (
    select 1
    from public.nexus_users n
    where n.key = 'nexus_users'
      and n.value_json ? k
  ) then
    raise exception 'username already exists';
  end if;

  select coalesce(value_json, '{}'::jsonb)
    into current_map
  from public.nexus_users
  where key = 'nexus_users'
  for update;

  profile := jsonb_build_object(
    'username', coalesce(nullif(requested_username, ''), split_part(coalesce(new.email, ''), '@', 1)),
    'email', new.email,
    'role', 'guest',
    'teamId', null,
    'createdAt', now(),
    'avatar', null,
    'authUserId', new.id
  );

  insert into public.nexus_users(key, value_json, updated_at)
  values ('nexus_users', jsonb_build_object(k, profile), now())
  on conflict (key) do update
    set value_json = public.nexus_users.value_json || jsonb_build_object(k, profile),
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.nexus_handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_ltl on auth.users;
create trigger on_auth_user_created_ltl
  after insert on auth.users
  for each row
  execute function public.nexus_handle_new_auth_user();

-- The browser no longer creates profiles directly.
-- Keep the legacy RPC definition for rollback/migration, but make it unavailable
-- to clients so a normal user cannot create arbitrary extra profiles.
revoke all on function public.nexus_create_profile(uuid,text,text) from public, anon, authenticated;
