-- Marvel Tracker: accounts, saved checklists and admin controls.
-- Run this once: Supabase dashboard > SQL Editor > New query > paste everything > Run.
-- It is safe to run again; it only adds what is missing and refreshes the rules.

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  role         text not null default 'user' check (role in ('user', 'admin')),
  blocked      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.checklists (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb
             check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000),
  updated_at timestamptz not null default now()
);

alter table public.profiles   enable row level security;
alter table public.checklists enable row level security;

-- ---------------------------------------------------------------- helpers
-- These run with the owner's rights so the rules below can look at profiles without looping.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and not p.blocked);
$$;

create or replace function public.is_blocked() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.blocked);
$$;

-- ---------------------------------------------------------------- row rules
-- Everyone can only touch their own rows. Admin actions go through the functions further down.
drop policy if exists "profiles: read own"    on public.profiles;
drop policy if exists "checklists: read own"  on public.checklists;
drop policy if exists "checklists: add own"   on public.checklists;
drop policy if exists "checklists: change own" on public.checklists;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "checklists: read own" on public.checklists
  for select to authenticated using (user_id = auth.uid() and not public.is_blocked());

create policy "checklists: add own" on public.checklists
  for insert to authenticated with check (user_id = auth.uid() and not public.is_blocked());

create policy "checklists: change own" on public.checklists
  for update to authenticated
  using (user_id = auth.uid() and not public.is_blocked())
  with check (user_id = auth.uid() and not public.is_blocked());

-- ---------------------------------------------------------------- new accounts
-- Runs when someone signs up. The very first account becomes the admin; everyone after is a normal user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'user'), '@', 1)),
    case when exists (select 1 from public.profiles) then 'user' else 'admin' end
  );
  insert into public.checklists (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- admin functions
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, display_name text, role text, blocked boolean,
  created_at timestamptz, last_sign_in_at timestamptz, watched integer, saved_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select p.id, p.email, p.display_name, p.role, p.blocked, p.created_at, u.last_sign_in_at,
           case when jsonb_typeof(c.data -> 'watched') = 'object'
                then (select count(*)::integer from jsonb_object_keys(c.data -> 'watched'))
                else 0 end,
           c.updated_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.checklists c on c.user_id = p.id
    order by p.created_at;
end;
$$;

create or replace function public.admin_set_blocked(target uuid, value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if target = auth.uid() then raise exception 'You cannot block your own account'; end if;
  update public.profiles set blocked = value where id = target;
  -- also stops the account from signing in or refreshing its session
  update auth.users set banned_until = case when value then now() + interval '100 years' else null end where id = target;
end;
$$;

create or replace function public.admin_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if new_role not in ('user', 'admin') then raise exception 'Unknown role'; end if;
  if target = auth.uid() then raise exception 'You cannot change your own role'; end if;
  update public.profiles set role = new_role where id = target;
end;
$$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if target = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  delete from auth.users where id = target;   -- the profile and checklist go with it
end;
$$;

-- ---------------------------------------------------------------- who may call what
revoke all on function public.is_admin(), public.is_blocked(),
  public.admin_list_users(), public.admin_set_blocked(uuid, boolean),
  public.admin_set_role(uuid, text), public.admin_delete_user(uuid) from public, anon;
grant execute on function public.is_admin(), public.is_blocked(),
  public.admin_list_users(), public.admin_set_blocked(uuid, boolean),
  public.admin_set_role(uuid, text), public.admin_delete_user(uuid) to authenticated;
