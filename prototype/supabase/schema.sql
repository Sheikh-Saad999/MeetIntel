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
-- The storage API reads the row back after writing it (INSERT ... RETURNING / upsert), so a SELECT
-- policy is required too. Scoped to the org's own folder; public URLs still serve logos to everyone.
drop policy if exists logos_select on storage.objects;
create policy logos_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and public.is_admin_of_path_org(name));
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


-- =====================================================================
-- PART 2: workspace data  (meetings, agenda, approvals, members, invites)
-- Run the WHOLE file again; every statement is idempotent. Existing companies are
-- upgraded in place (approval chain and member emails are filled in automatically).
-- =====================================================================

-- ---------- Approval chain defaults per sector (copied to each company; the company can edit its own) ----------
alter table public.sectors add column if not exists default_approval_stages text[] not null default '{}';
update public.sectors set default_approval_stages = case id
  when 'education'      then array['HOD', 'Dean', 'Vice Chancellor']
  when 'pharmaceutical' then array['Department Head', 'QA Head', 'Plant Director']
  when 'healthcare'     then array['Department Head', 'Medical Director', 'CEO']
  when 'banking'        then array['Department Head', 'Compliance Officer', 'Executive Committee']
  when 'insurance'      then array['Department Head', 'Compliance Officer', 'Executive Committee']
  when 'government'     then array['Section Head', 'Director', 'Secretary']
  else array['Department Head', 'Director', 'Executive']
end;

alter table public.memberships add column if not exists email text;
alter table public.memberships add column if not exists approval_stage int check (approval_stage is null or approval_stage >= 1);
update public.memberships m set email = u.email from auth.users u where u.id = m.user_id and m.email is null;

create unique index if not exists departments_id_org_uidx on public.departments (id, org_id);

create table if not exists public.approval_stages (
  org_id uuid not null references public.organizations(id) on delete cascade,
  position int not null check (position >= 1),
  name text not null check (char_length(name) between 1 and 60),
  primary key (org_id, position)
);

insert into public.approval_stages (org_id, position, name)
select o.id, t.ord, t.name
from public.organizations o
join public.sectors s on s.id = o.sector_id
cross join lateral unnest(case when cardinality(s.default_approval_stages) > 0
                               then s.default_approval_stages else array['Department Head', 'Director', 'Executive'] end)
     with ordinality as t(name, ord)
where not exists (select 1 from public.approval_stages a where a.org_id = o.id)
on conflict do nothing;

-- ---------- Meetings ----------
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  department_id uuid,
  scheduled_at timestamptz not null,
  mode text not null default 'Face-to-face' check (mode in ('Face-to-face', 'Online', 'Hybrid')),
  chair text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (department_id, org_id) references public.departments (id, org_id) on delete set null (department_id)
);
create unique index if not exists meetings_id_org_uidx on public.meetings (id, org_id);
create index if not exists meetings_org_time_idx on public.meetings (org_id, scheduled_at);

-- ---------- Agenda items ----------
create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null,
  title text not null check (char_length(title) between 2 and 200),
  description text,
  submitted_by uuid not null default auth.uid(),
  submitted_by_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  foreign key (meeting_id, org_id) references public.meetings (id, org_id) on delete cascade
);
create unique index if not exists agenda_items_id_org_uidx on public.agenda_items (id, org_id);
create index if not exists agenda_items_org_idx on public.agenda_items (org_id, meeting_id);

-- The browser may not choose who submitted an item, its status, or its timestamp.
create or replace function public.agenda_items_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.submitted_by := auth.uid();
  new.submitted_by_name := (select email from public.memberships where user_id = auth.uid() and org_id = new.org_id);
  new.status := 'pending';
  new.created_at := now();
  return new;
end $$;
drop trigger if exists agenda_items_before_insert on public.agenda_items;
create trigger agenda_items_before_insert before insert on public.agenda_items
  for each row execute function public.agenda_items_before_insert();

-- ---------- Approval decisions (the audit trail; written only by decide_agenda_item) ----------
create table if not exists public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  item_id uuid not null,
  stage_position int not null,
  stage_name text not null,
  action text not null check (action in ('approved', 'rejected')),
  decided_by uuid not null,
  decided_by_email text,
  decided_at timestamptz not null default now(),
  foreign key (item_id, org_id) references public.agenda_items (id, org_id) on delete cascade,
  unique (item_id, stage_position)
);
create index if not exists approval_decisions_org_idx on public.approval_decisions (org_id, decided_at);

-- ---------- Invites (one-time codes; no email sending needed) ----------
create table if not exists public.invites (
  code text primary key default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  org_id uuid not null references public.organizations(id) on delete cascade,
  approval_stage int check (approval_stage is null or approval_stage >= 1),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid,
  used_at timestamptz
);

-- ---------- Functions ----------
-- Replaces the version above: also records the admin's email and copies the sector's approval chain.
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
  insert into public.memberships (org_id, user_id, role, email)
  values (v_org.id, v_uid, 'admin', (select email from auth.users where id = v_uid));
  insert into public.approval_stages (org_id, position, name)
  select v_org.id, t.ord, t.name
  from public.sectors s
  cross join lateral unnest(case when cardinality(s.default_approval_stages) > 0
                                 then s.default_approval_stages else array['Department Head', 'Director', 'Executive'] end)
       with ordinality as t(name, ord)
  where s.id = p_sector_id;
  return v_org;
end $$;

-- Keeps rows (and anything linked to them) for names that stay; used by the first-time setup wizard.
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
  delete from public.departments where org_id = p_org and name <> all (v_names);
  insert into public.departments (org_id, name)
  select p_org, n from unnest(v_names) as n
  where not exists (select 1 from public.departments d where d.org_id = p_org and d.name = n);
end $$;

-- Used by the workspace: items are [{id, name}]. Renaming keeps the id, so meetings stay linked.
create or replace function public.sync_departments(p_org uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_name text; v_keep uuid[];
begin
  if not public.is_admin(p_org) then raise exception 'Only an organization admin can edit departments.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Invalid department list.'; end if;
  select coalesce(array_agg((e->>'id')::uuid), '{}') into v_keep
  from jsonb_array_elements(p_items) e where nullif(e->>'id', '') is not null;
  delete from public.departments where org_id = p_org and id <> all (v_keep);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_name := trim(coalesce(v_item->>'name', ''));
    if v_name = '' then continue; end if;
    if nullif(v_item->>'id', '') is not null then
      update public.departments set name = v_name where id = (v_item->>'id')::uuid and org_id = p_org;
    else
      insert into public.departments (org_id, name) values (p_org, v_name);
    end if;
  end loop;
end $$;

create or replace function public.save_approval_stages(p_org uuid, p_names text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_names text[]; v_current int;
begin
  if not public.is_admin(p_org) then raise exception 'Only an organization admin can change the approval chain.'; end if;
  select coalesce(array_agg(n order by first_pos), '{}') into v_names from (
    select trim(x) as n, min(ord) as first_pos
    from unnest(coalesce(p_names, '{}')) with ordinality as t(x, ord)
    where trim(x) <> '' group by trim(x)
  ) s;
  if cardinality(v_names) < 1 or cardinality(v_names) > 5 then
    raise exception 'The approval chain needs between 1 and 5 stages.';
  end if;
  select count(*) into v_current from public.approval_stages where org_id = p_org;
  if v_current <> cardinality(v_names)
     and exists (select 1 from public.agenda_items where org_id = p_org and status = 'pending') then
    raise exception 'Decide or finish the pending agenda items before changing the number of stages. (Renaming a stage is always allowed.)';
  end if;
  delete from public.approval_stages where org_id = p_org;
  insert into public.approval_stages (org_id, position, name)
  select p_org, ord, n from unnest(v_names) with ordinality as t(n, ord);
  -- a member's assigned stage that no longer exists is cleared
  update public.memberships set approval_stage = null
  where org_id = p_org and approval_stage > cardinality(v_names);
end $$;

create or replace function public.decide_agenda_item(p_item uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_item public.agenda_items; v_total int; v_approved int; v_pos int;
  v_stage text; v_role text; v_assigned int; v_result text; v_next text;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'Invalid action.'; end if;
  select * into v_item from public.agenda_items where id = p_item for update;
  if not found or not public.is_member(v_item.org_id) then raise exception 'Item not found.'; end if;
  if v_item.status <> 'pending' then raise exception 'This item has already been decided.'; end if;

  select count(*) into v_total from public.approval_stages where org_id = v_item.org_id;
  if v_total = 0 then raise exception 'No approval chain is configured.'; end if;
  select count(*) into v_approved from public.approval_decisions where item_id = p_item and action = 'approved';
  v_pos := v_approved + 1;
  select name into v_stage from public.approval_stages where org_id = v_item.org_id and position = v_pos;

  select role, approval_stage into v_role, v_assigned
  from public.memberships where org_id = v_item.org_id and user_id = v_uid;
  -- NULL-safe on purpose: a member with no assigned stage (NULL) must be refused, not waved through.
  if not (coalesce(v_role = 'admin', false) or coalesce(v_assigned = v_pos, false)) then
    raise exception 'You are not the approver for the "%" stage.', v_stage;
  end if;

  insert into public.approval_decisions (org_id, item_id, stage_position, stage_name, action, decided_by, decided_by_email)
  values (v_item.org_id, p_item, v_pos, v_stage, case p_action when 'approve' then 'approved' else 'rejected' end,
          v_uid, (select email from public.memberships where org_id = v_item.org_id and user_id = v_uid));

  v_result := case when p_action = 'reject' then 'rejected' when v_pos >= v_total then 'approved' else 'pending' end;
  update public.agenda_items set status = v_result where id = p_item;
  if v_result = 'pending' then
    select name into v_next from public.approval_stages where org_id = v_item.org_id and position = v_pos + 1;
  end if;
  return jsonb_build_object('stage', v_stage, 'result', v_result, 'next_stage', v_next);
end $$;

create or replace function public.set_member_stage(p_org uuid, p_user uuid, p_stage int)
returns void language plpgsql security definer set search_path = public as $$
declare v_total int;
begin
  if not public.is_admin(p_org) then raise exception 'Only an organization admin can assign approvers.'; end if;
  select count(*) into v_total from public.approval_stages where org_id = p_org;
  if p_stage is not null and (p_stage < 1 or p_stage > v_total) then raise exception 'That approval stage does not exist.'; end if;
  update public.memberships set approval_stage = p_stage where org_id = p_org and user_id = p_user;
end $$;

create or replace function public.create_invite(p_org uuid, p_stage int default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_total int; v_code text;
begin
  if not public.is_admin(p_org) then raise exception 'Only an organization admin can invite members.'; end if;
  select count(*) into v_total from public.approval_stages where org_id = p_org;
  if p_stage is not null and (p_stage < 1 or p_stage > v_total) then raise exception 'That approval stage does not exist.'; end if;
  if (select count(*) from public.invites where org_id = p_org and used_by is null and expires_at > now()) >= 20 then
    raise exception 'Too many unused invites. Wait for them to be used or to expire.';
  end if;
  insert into public.invites (org_id, approval_stage) values (p_org, p_stage) returning code into v_code;
  return v_code;
end $$;

create or replace function public.join_organization(p_code text)
returns public.organizations language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_inv public.invites; v_org public.organizations; v_max int; v_count int;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if exists (select 1 from public.memberships where user_id = v_uid) then
    raise exception 'You already belong to an organization.';
  end if;
  select * into v_inv from public.invites where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found or v_inv.used_by is not null or v_inv.expires_at < now() then
    raise exception 'This invite code is invalid, expired or already used.';
  end if;
  select o.* into v_org from public.organizations o where o.id = v_inv.org_id;
  select max_members into v_max from public.plans where id = v_org.plan_id;
  select count(*) into v_count from public.memberships where org_id = v_org.id;
  if v_max is not null and v_count >= v_max then
    raise exception 'This company has reached the member limit of its plan.';
  end if;
  insert into public.memberships (org_id, user_id, role, email, approval_stage)
  values (v_org.id, v_uid, 'member', (select email from auth.users where id = v_uid),
          case when v_inv.approval_stage <= (select count(*) from public.approval_stages where org_id = v_org.id)
               then v_inv.approval_stage end);
  update public.invites set used_by = v_uid, used_at = now() where code = v_inv.code;
  return v_org;
end $$;

-- ---------- Row Level Security ----------
alter table public.approval_stages    enable row level security;
alter table public.meetings           enable row level security;
alter table public.agenda_items       enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.invites            enable row level security;

drop policy if exists stages_read on public.approval_stages;
create policy stages_read on public.approval_stages for select to authenticated using (public.is_member(org_id));

drop policy if exists meetings_read on public.meetings;
create policy meetings_read on public.meetings for select to authenticated using (public.is_member(org_id));
drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.is_member(org_id) and created_by = auth.uid());
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update to authenticated
  using (public.is_member(org_id) and (created_by = auth.uid() or public.is_admin(org_id)))
  with check (public.is_member(org_id) and (created_by = auth.uid() or public.is_admin(org_id)));
drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings for delete to authenticated using (public.is_admin(org_id));

drop policy if exists agenda_read on public.agenda_items;
create policy agenda_read on public.agenda_items for select to authenticated using (public.is_member(org_id));
drop policy if exists agenda_insert on public.agenda_items;
create policy agenda_insert on public.agenda_items for insert to authenticated with check (public.is_member(org_id));

drop policy if exists decisions_read on public.approval_decisions;
create policy decisions_read on public.approval_decisions for select to authenticated using (public.is_member(org_id));

drop policy if exists invites_read on public.invites;
create policy invites_read on public.invites for select to authenticated using (public.is_admin(org_id));

-- ---------- Privileges ----------
grant select on public.approval_stages, public.approval_decisions, public.invites to authenticated;
-- Column-level grants: the browser can only write the fields below. created_by / submitted_by /
-- status / timestamps are set by the database, so they cannot be forged.
grant select, delete on public.meetings to authenticated;
grant insert (org_id, title, department_id, scheduled_at, mode, chair, notes) on public.meetings to authenticated;
grant update (title, department_id, scheduled_at, mode, chair, notes, status) on public.meetings to authenticated;
grant select on public.agenda_items to authenticated;
grant insert (org_id, meeting_id, title, description) on public.agenda_items to authenticated;

revoke execute on function public.sync_departments(uuid, jsonb) from public, anon;
revoke execute on function public.save_approval_stages(uuid, text[]) from public, anon;
revoke execute on function public.decide_agenda_item(uuid, text) from public, anon;
revoke execute on function public.set_member_stage(uuid, uuid, int) from public, anon;
revoke execute on function public.create_invite(uuid, int) from public, anon;
revoke execute on function public.join_organization(text) from public, anon;
revoke execute on function public.create_organization(text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.save_departments(uuid, text[]) from public, anon;
grant execute on function public.sync_departments(uuid, jsonb) to authenticated;
grant execute on function public.save_approval_stages(uuid, text[]) to authenticated;
grant execute on function public.decide_agenda_item(uuid, text) to authenticated;
grant execute on function public.set_member_stage(uuid, uuid, int) to authenticated;
grant execute on function public.create_invite(uuid, int) to authenticated;
grant execute on function public.join_organization(text) to authenticated;
grant execute on function public.create_organization(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.save_departments(uuid, text[]) to authenticated;
