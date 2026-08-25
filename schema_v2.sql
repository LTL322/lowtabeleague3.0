-- LTL V2 secure storage
-- All application state is stored in public.nexus_users (key/value JSONB).
-- Direct table access is blocked. The frontend uses SECURITY DEFINER RPCs.

create table if not exists public.nexus_users (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nexus_users enable row level security;

revoke all on table public.nexus_users from anon, authenticated;

-- Migrate the current state table into the new single storage table.
insert into public.nexus_users(key, value_json, updated_at)
select key, value_json, coalesce(updated_at, now())
from public.ltl_state
on conflict (key) do update
set value_json = excluded.value_json,
    updated_at = excluded.updated_at;

create or replace function public.ltl_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nexus_users n
    cross join lateral jsonb_each(coalesce(n.value_json, '{}'::jsonb)) u(username, profile)
    where n.key = 'nexus_users'
      and lower(username) = lower(coalesce((select raw_user_meta_data->>'username' from auth.users where id = auth.uid()), ''))
      and coalesce(profile->>'role', 'guest') in ('admin','head')
  );
$$;

grant execute on function public.ltl_is_staff() to anon, authenticated;

-- Read state through RPC. The table itself remains inaccessible.
create or replace function public.nexus_get_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value_json), '{}'::jsonb)
  from public.nexus_users;
$$;

grant execute on function public.nexus_get_state() to anon, authenticated;

-- Staff-only state writes for all site data.
create or replace function public.nexus_set_state(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ltl_is_staff() then
    raise exception 'staff access required';
  end if;

  insert into public.nexus_users(key, value_json, updated_at)
  values (p_key, coalesce(p_value, '{}'::jsonb), now())
  on conflict (key) do update
    set value_json = excluded.value_json,
        updated_at = now();
end;
$$;

grant execute on function public.nexus_set_state(text,jsonb) to authenticated;

create or replace function public.nexus_delete_state(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ltl_is_staff() then
    raise exception 'staff access required';
  end if;
  delete from public.nexus_users where key = p_key;
end;
$$;

grant execute on function public.nexus_delete_state(text) to authenticated;

-- A normal authenticated user may update only their own profile's avatar fields.
create or replace function public.nexus_update_my_profile(p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  username_key text;
  current_map jsonb;
  old_profile jsonb;
  clean_old jsonb;
  clean_new jsonb;
begin
  username_key := lower(coalesce((select raw_user_meta_data->>'username' from auth.users where id = auth.uid()), ''));
  if username_key = '' then
    raise exception 'authentication required';
  end if;

  select coalesce(value_json, '{}'::jsonb) into current_map
  from public.nexus_users
  where key = 'nexus_users'
  for update;

  old_profile := coalesce(current_map->username_key, '{}'::jsonb);
  if old_profile = '{}'::jsonb then
    raise exception 'profile not found';
  end if;

  clean_old := old_profile - 'avatar' - 'avatar_url';
  clean_new := coalesce(p_profile, '{}'::jsonb) - 'avatar' - 'avatar_url';

  if clean_old is distinct from clean_new then
    raise exception 'only avatar fields can be changed';
  end if;

  current_map := jsonb_set(current_map, array[username_key], coalesce(p_profile,'{}'::jsonb), true);

  update public.nexus_users
  set value_json = current_map, updated_at = now()
  where key = 'nexus_users';
end;
$$;

grant execute on function public.nexus_update_my_profile(jsonb) to authenticated;

-- Profile creation after Supabase Auth signup. It cannot grant admin/head.
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
  if p_user_id is null or k = '' then
    raise exception 'invalid profile';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and lower(coalesce(u.email, '')) = lower(trim(p_email))
  ) then
    raise exception 'auth user not found';
  end if;

  if exists (
    select 1 from public.nexus_users n
    where n.key = 'nexus_users'
      and n.value_json ? k
  ) then
    raise exception 'username already exists';
  end if;

  select coalesce(value_json, '{}'::jsonb) into current_map
  from public.nexus_users
  where key = 'nexus_users'
  for update;

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

grant execute on function public.nexus_create_profile(uuid,text,text) to anon, authenticated;

-- One-time verification helper: no raw table access is needed.
create or replace function public.nexus_storage_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'storage_table', to_regclass('public.nexus_users') is not null,
    'rls_enabled', coalesce((select relrowsecurity from pg_class where oid = 'public.nexus_users'::regclass), false),
    'keys', (select count(*) from public.nexus_users)
  );
$$;

grant execute on function public.nexus_storage_health() to anon, authenticated;

-- Do NOT drop ltl_state automatically. Keep it as a rollback backup until V2 is verified.

-- Privacy-oriented read APIs. Public visitors do not receive the full profile map.
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

grant execute on function public.nexus_get_public_state() to anon, authenticated;

create or replace function public.nexus_get_user_directory()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(lower(k),
    jsonb_build_object(
      'username', v->>'username',
      'role', coalesce(v->>'role','guest'),
      'teamId', v->'teamId',
      'createdAt', v->'createdAt',
      'avatar', v->'avatar',
      'avatar_url', v->'avatar_url'
    )), '{}')
  from public.nexus_users n
  cross join lateral jsonb_each(coalesce(n.value_json, '{}'::jsonb)) e(k,v)
  where n.key = 'nexus_users';
$$;

grant execute on function public.nexus_get_user_directory() to anon, authenticated;

create or replace function public.nexus_get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(n.value_json -> lower(coalesce((select raw_user_meta_data->>'username' from auth.users where id = auth.uid()), '')), '{}'::jsonb)
  from public.nexus_users n
  where n.key = 'nexus_users';
$$;

grant execute on function public.nexus_get_my_profile() to authenticated;

create or replace function public.nexus_resolve_login(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select v->>'email'
  from public.nexus_users n
  cross join lateral jsonb_each(coalesce(n.value_json, '{}'::jsonb)) e(k,v)
  where n.key = 'nexus_users'
    and lower(k) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.nexus_resolve_login(text) to anon, authenticated;
revoke execute on function public.nexus_get_state() from anon;
