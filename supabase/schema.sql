-- eXperience Padel MVP schema (multi-tenant)
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query)
-- for a brand new project. Each row of `settings` is one tenant ("venue" /
-- club); every other table is scoped to a venue via `venue_id`. New venues
-- are created through the app's own signup + setup flow, not seeded here.

create extension if not exists pgcrypto;

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id),
  slug text unique,
  venue_name text not null default 'Mi club',
  whatsapp_phone text not null default '',
  logo_url text,
  slot_duration_minutes int not null default 60,
  open_hour int not null default 8,
  close_hour int not null default 23,
  about text not null default '',
  address text not null default '',
  instagram_url text
);

create table if not exists courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  name text not null,
  price numeric not null default 8000
);

create table if not exists closed_dates (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  date date not null,
  reason text,
  unique (venue_id, date)
);

create table if not exists fixed_slots (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  court_id uuid not null references courts(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  time text not null,
  customer_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  court_id uuid not null references courts(id) on delete cascade,
  date date not null,
  time text not null,
  players int not null,
  status text not null check (status in ('reservado', 'confirmado', 'cancelado')),
  customer_name text,
  created_via text not null check (created_via in ('user', 'admin')),
  price_total numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  name text not null,
  unique (venue_id, name)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  name text not null,
  description text not null default '',
  category_id uuid references categories(id) on delete set null,
  price numeric not null
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  date date not null,
  total numeric not null,
  payment_status text not null default 'pagado' check (payment_status in ('pagado', 'adeuda')),
  payment_method text check (payment_method in ('efectivo', 'transferencia', 'mixto')),
  customer_name text,
  reservation_id uuid references reservations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  qty int not null,
  unit_price numeric not null
);

create table if not exists sale_payments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  sale_id uuid not null references sales(id) on delete cascade,
  method text not null check (method in ('efectivo', 'transferencia')),
  amount numeric not null
);

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  name text not null,
  date date not null,
  description text not null default '',
  image_url text,
  published boolean not null default true
);

create table if not exists hero_slides (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  image_url text not null default '',
  title text not null,
  subtitle text not null default '',
  body text not null default '',
  "order" int not null default 0,
  published boolean not null default true
);

create table if not exists ranking_categories (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  name text not null,
  unique (venue_id, name)
);

create table if not exists ranking_points (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  instance text not null check (
    instance in ('fase_grupos', 'dieciseisavos', 'octavos', 'cuartos', 'semis', 'finalista', 'campeon')
  ),
  points numeric not null default 0,
  unique (venue_id, instance)
);

create table if not exists ranking_entries (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  category_id uuid not null references ranking_categories(id) on delete cascade,
  player_name text not null,
  total_points numeric not null default 0,
  best_instance text not null check (
    best_instance in ('fase_grupos', 'dieciseisavos', 'octavos', 'cuartos', 'semis', 'finalista', 'campeon')
  ),
  unique (venue_id, category_id, player_name)
);

-- Row level security.
alter table settings enable row level security;
alter table courts enable row level security;
alter table reservations enable row level security;
alter table products enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table sale_payments enable row level security;
alter table tournaments enable row level security;
alter table hero_slides enable row level security;
alter table closed_dates enable row level security;
alter table fixed_slots enable row level security;
alter table categories enable row level security;
alter table ranking_categories enable row level security;
alter table ranking_points enable row level security;
alter table ranking_entries enable row level security;

-- The single source of truth every write policy checks against: the
-- venue owned by the currently authenticated user, if any.
create or replace function get_my_venue_id()
returns uuid
language sql
security definer
stable
as $$
  select id from settings where owner_id = auth.uid() limit 1;
$$;

-- settings: select is public (the public site resolves a venue by slug),
-- insert is what makes self-serve signup work (a fresh user can create
-- exactly one venue for themselves), update/delete are owner-only.
create policy "public read settings" on settings for select using (true);
create policy "owner insert settings" on settings for insert
  with check (owner_id = auth.uid());
create policy "owner update settings" on settings for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete settings" on settings for delete
  using (owner_id = auth.uid());

create policy "public read courts" on courts for select using (true);
create policy "owner write courts" on courts for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read reservations" on reservations for select using (true);
create policy "public create reservations" on reservations for insert with check (true);
create policy "owner update reservations" on reservations for update
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());
create policy "owner delete reservations" on reservations for delete
  using (venue_id = get_my_venue_id());

create policy "public read products" on products for select using (true);
create policy "owner write products" on products for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

-- Financial data: admin-of-that-venue only, never public.
create policy "owner read sales" on sales for select
  using (venue_id = get_my_venue_id());
create policy "owner write sales" on sales for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "owner read sale_items" on sale_items for select
  using (venue_id = get_my_venue_id());
create policy "owner write sale_items" on sale_items for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "owner read sale_payments" on sale_payments for select
  using (venue_id = get_my_venue_id());
create policy "owner write sale_payments" on sale_payments for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read tournaments" on tournaments for select using (true);
create policy "owner write tournaments" on tournaments for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read hero_slides" on hero_slides for select using (true);
create policy "owner write hero_slides" on hero_slides for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read closed_dates" on closed_dates for select using (true);
create policy "owner write closed_dates" on closed_dates for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read fixed_slots" on fixed_slots for select using (true);
create policy "owner write fixed_slots" on fixed_slots for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read categories" on categories for select using (true);
create policy "owner write categories" on categories for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read ranking_categories" on ranking_categories for select using (true);
create policy "owner write ranking_categories" on ranking_categories for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read ranking_points" on ranking_points for select using (true);
create policy "owner write ranking_points" on ranking_points for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

create policy "public read ranking_entries" on ranking_entries for select using (true);
create policy "owner write ranking_entries" on ranking_entries for all
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

-- Storage bucket for hero slide, tournament, and venue logo images,
-- uploaded from the admin panel.
insert into storage.buckets (id, name, public)
values ('slides', 'slides', true)
on conflict (id) do nothing;

create policy "public read slide images" on storage.objects for select
  using (bucket_id = 'slides');
create policy "admin write slide images" on storage.objects for all
  using (bucket_id = 'slides' and auth.role() = 'authenticated')
  with check (bucket_id = 'slides' and auth.role() = 'authenticated');

-- Realtime: let clients subscribe to live reservation changes.
alter publication supabase_realtime add table public.reservations;

-- No seed data: venues (settings rows) are created by signing up through
-- the app (/admin/signup).
--
-- This file is the schema as of migration 012. On a brand new project, run
-- every file from supabase/migrations/013 onward right after it, in order:
-- they add the free trial, the create_venue() signup function, the final RLS
-- policies, the demo venue, the superadmin view and product stock.
