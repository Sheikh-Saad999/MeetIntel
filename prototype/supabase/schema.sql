-- =====================================================================
-- MeetIntel SaaS schema  (Supabase / Postgres)
-- Run ONCE in Supabase -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: every statement is idempotent.
--
-- Multi-tenant rule: every company's data hangs off organizations.id, and
-- Row Level Security (RLS) lets a signed-in user see only the organization
-- they belong to. Nothing is readable or writable unless a policy allows it.
-- =====================================================================

-- ---------- Reference data (readable by everyone, writable by nobody) ----------
create table if not exists public.plans (
  id text primary key,                         -- 'free' | 'pro' | 'enterprise'
  name text not null,
  price_usd_month numeric not null default 0,
  max_departments int,                         -- null = unlimited
  max_members int,                             -- null = unlimited
  ai_queries_per_month int,                    -- null = unlimited / custom
  sort_order int not null default 0
);

create table if not exists public.sectors (
  id text primary key,                         -- slug, e.g. 'pharmaceutical'
  name text not null,
  default_departments text[] not null default '{}',
  sort_order int not null default 0
);

-- ---------- Tenants ----------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  sector_id text not null references public.sectors(id),
  plan_id text not null default 'free' references public.plans(id),
  logo_url text,
  website text,
  phone text,
  address text,
  description text,
  employee_range text,
  legacy_demo boolean not null default false,  -- set by hand (SQL) for the DSU demo org only
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
-- one organization per user for now (invites / multi-org can come later)
create unique index if not exists memberships_one_org_per_user on public.memberships (user_id);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
create index if not exists departments_org_idx on public.departments (org_id);

-- ---------- Helper functions (used by RLS policies) ----------
create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.is_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid() and role = 'admin');
$$;

-- storage paths look like '<org-uuid>/logo.png'; this is false (not an error) for anything else
create or replace function public.is_admin_of_path_org(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_path, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then public.is_admin(split_part(p_path, '/', 1)::uuid)
    else false
  end;
$$;

-- ---------- Plan limit enforced in the database, not just the UI ----------
create or replace function public.enforce_department_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  select p.max_departments into v_max
  from public.organizations o join public.plans p on p.id = o.plan_id
  where o.id = new.org_id;
  if v_max is not null then
    select count(*) into v_count from public.departments where org_id = new.org_id;
    if v_count >= v_max then
      raise exception 'Department limit reached for your plan (max %).', v_max using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists departments_limit on public.departments;
create trigger departments_limit before insert on public.departments
  for each row execute function public.enforce_department_limit();

-- ---------- RPCs the app calls ----------
create or replace function public.create_organization(
  p_name text, p_sector_id text, p_plan_id text default 'free',
  p_website text default null, p_phone text default null, p_address text default null,
  p_description text default null, p_employee_range text default null
) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organizations;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if exists (select 1 from public.memberships where user_id = v_uid) then
    raise exception 'You already belong to an organization.';
  end if;
  insert into public.organizations (name, sector_id, plan_id, website, phone, address, description, employee_range)
  values (trim(p_name), p_sector_id, coalesce(p_plan_id, 'free'),
          nullif(trim(p_website), ''), nullif(trim(p_phone), ''), nullif(trim(p_address), ''),
          nullif(trim(p_description), ''), nullif(trim(p_employee_range), ''))
  returning * into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org.id, v_uid, 'admin');
  return v_org;
end $$;

-- Replaces the organization's department list in one atomic step.
create or replace function public.save_departments(p_org uuid, p_names text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_names text[];
begin
  if not public.is_admin(p_org) then raise exception 'Only an organization admin can edit departments.'; end if;
  select coalesce(array_agg(n order by first_pos), '{}') into v_names from (
    select trim(x) as n, min(ord) as first_pos
    from unnest(coalesce(p_names, '{}')) with ordinality as t(x, ord)
    where trim(x) <> '' group by trim(x)
  ) s;
  delete from public.departments where org_id = p_org;
  insert into public.departments (org_id, name) select p_org, unnest(v_names);
end $$;

-- Simulated billing: the plan changes with no payment. Real billing must replace this with a
-- server-side payment webhook; the browser must never be able to pick its own plan for free.
create or replace function public.change_plan(p_org uuid, p_plan_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  if not public.is_admin(p_org) then raise exception 'Only an organization admin can change the plan.'; end if;
  select max_departments into v_max from public.plans where id = p_plan_id;
  if not found then raise exception 'Unknown plan.'; end if;
  select count(*) into v_count from public.departments where org_id = p_org;
  if v_max is not null and v_count > v_max then
    raise exception 'You have % departments; remove some before moving to this plan (max %).', v_count, v_max;
  end if;
  update public.organizations set plan_id = p_plan_id where id = p_org;
end $$;

-- ---------- Row Level Security ----------
alter table public.plans         enable row level security;
alter table public.sectors       enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;
alter table public.departments   enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to anon, authenticated using (true);

drop policy if exists sectors_read on public.sectors;
create policy sectors_read on public.sectors for select to anon, authenticated using (true);

drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated using (public.is_member(id));

drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));

drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships for select to authenticated using (public.is_member(org_id));

drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using (public.is_member(org_id));
-- departments are written only through save_departments() (security definer)

-- ---------- Table privileges (the project has "auto-expose new tables" switched off) ----------
grant usage on schema public to anon, authenticated;
grant select on public.plans, public.sectors to anon, authenticated;
grant select on public.organizations, public.memberships, public.departments to authenticated;
-- admins may edit profile fields only; plan_id / legacy_demo can't be changed from the browser
revoke update on public.organizations from authenticated;
grant update (name, logo_url, website, phone, address, description, employee_range) on public.organizations to authenticated;

revoke execute on function public.create_organization(text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.save_departments(uuid, text[]) from public, anon;
revoke execute on function public.change_plan(uuid, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.save_departments(uuid, text[]) to authenticated;
grant execute on function public.change_plan(uuid, text) to authenticated;
grant execute on function public.is_member(uuid), public.is_admin(uuid), public.is_admin_of_path_org(text) to authenticated;

-- ---------- Logo storage (public read; only the org's admins can write into their own folder) ----------
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;

drop policy if exists logos_insert on storage.objects;
create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_admin_of_path_org(name));
drop policy if exists logos_update on storage.objects;
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_admin_of_path_org(name))
  with check (bucket_id = 'logos' and public.is_admin_of_path_org(name));
drop policy if exists logos_delete on storage.objects;
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_admin_of_path_org(name));

-- ---------- Seed: plans ----------
insert into public.plans (id, name, price_usd_month, max_departments, max_members, ai_queries_per_month, sort_order) values
  ('free',       'Free',       0,   3,    5,    20,   1),
  ('pro',        'Pro',        49,  10,   25,   500,  2),
  ('enterprise', 'Enterprise', 199, null, null, null, 3)
on conflict (id) do update set
  name = excluded.name, price_usd_month = excluded.price_usd_month, max_departments = excluded.max_departments,
  max_members = excluded.max_members, ai_queries_per_month = excluded.ai_queries_per_month, sort_order = excluded.sort_order;

-- ---------- Seed: sectors (with sensible starting departments the customer can edit) ----------
insert into public.sectors (id, name, sort_order, default_departments) values
  ('education',      'Education / University',          1,  array['Academic Affairs','Examinations','Admissions','Finance','Human Resources','IT']),
  ('pharmaceutical', 'Pharmaceutical',                  2,  array['Quality Assurance','Quality Control','Production','Research & Development','Regulatory Affairs','Supply Chain','Finance','Human Resources']),
  ('healthcare',     'Healthcare / Hospital',           3,  array['Clinical Services','Nursing','Pharmacy','Laboratory','Administration','Finance','Human Resources']),
  ('banking',        'Banking & Finance',               4,  array['Retail Banking','Corporate Banking','Risk & Compliance','Treasury','Operations','IT','Human Resources']),
  ('insurance',      'Insurance',                       5,  array['Underwriting','Claims','Actuarial','Sales','Compliance','Finance']),
  ('manufacturing',  'Manufacturing',                   6,  array['Production','Quality','Maintenance','Procurement','Supply Chain','Health & Safety','Finance']),
  ('textile',        'Textile & Apparel',               7,  array['Spinning','Weaving','Processing','Merchandising','Quality','Compliance','Finance']),
  ('it',             'IT & Software',                   8,  array['Engineering','Product','QA','DevOps','Sales','Support','Human Resources']),
  ('telecom',        'Telecommunications',              9,  array['Network Operations','Customer Care','Sales & Marketing','Regulatory','IT','Finance']),
  ('retail',         'Retail & E-commerce',             10, array['Merchandising','Store Operations','Marketing','Supply Chain','Customer Service','Finance']),
  ('construction',   'Construction & Real Estate',      11, array['Projects','Engineering','Procurement','Sales','Legal','Finance','Health & Safety']),
  ('energy',         'Energy & Utilities',              12, array['Generation','Transmission & Distribution','Maintenance','Regulatory','Health & Safety','Finance']),
  ('logistics',      'Logistics & Transport',           13, array['Operations','Fleet','Warehousing','Customer Service','Compliance','Finance']),
  ('food',           'Food & Beverage',                 14, array['Production','Quality & Food Safety','Procurement','Sales','Supply Chain','Finance']),
  ('hospitality',    'Hospitality & Tourism',           15, array['Front Office','Housekeeping','Food & Beverage','Sales & Marketing','Finance','Human Resources']),
  ('agriculture',    'Agriculture',                     16, array['Crop Production','Livestock','Procurement','Processing','Sales','Finance']),
  ('government',     'Government & Public Sector',      17, array['Administration','Planning','Finance','Legal','Human Resources','IT']),
  ('ngo',            'NGO / Non-profit',                18, array['Programs','Fundraising','Finance','Monitoring & Evaluation','Human Resources','Communications']),
  ('other',          'Other',                           99, array['Management','Operations','Finance','Human Resources'])
on conflict (id) do update set
  name = excluded.name, sort_order = excluded.sort_order, default_departments = excluded.default_departments;
