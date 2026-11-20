-- ==============================================================================
-- Firecracker Shop - Supabase Database Schema & Storage Setup
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PRODUCTS TABLE
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
  price numeric(10, 2) not null check (price >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  unit text not null default 'box', -- box / packet / piece
  low_stock_level integer not null default 10 check (low_stock_level >= 0),
  video_url text,
  qr_code text unique not null,
  created_at timestamptz not null default now()
);

-- 2. BILLS TABLE
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text unique not null,
  customer_name text not null,
  place text,
  bill_date timestamptz not null default now(),
  subtotal numeric(10, 2) not null default 0,
  discount_percent numeric(5, 2) not null default 0,
  discount_amount numeric(10, 2) not null default 0,
  final_total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- 3. BILL ITEMS TABLE
create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  rate numeric(10, 2) not null check (rate >= 0),
  quantity integer not null check (quantity > 0),
  total numeric(10, 2) not null check (total >= 0)
);

-- 4. REQUESTED ITEMS TABLE (Customer asked for crackers out of stock)
create table if not exists public.requested_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  requested_at timestamptz not null default now()
);

-- 5. SETTINGS TABLE (Single row configuration)
create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  total_investment numeric(12, 2) not null default 150000.00,
  pin_hash text not null default '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', -- default SHA-256 for '1234'
  updated_at timestamptz not null default now()
);

-- Ensure the single settings row exists
insert into public.settings (id, total_investment, pin_hash)
values (1, 150000.00, '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
on conflict (id) do nothing;

-- 6. STORAGE BUCKET FOR DEMO VIDEOS
insert into storage.buckets (id, name, public)
values ('cracker-videos', 'cracker-videos', true)
on conflict (id) do nothing;

-- Storage Policy: Allow public read and authenticated/anon uploads for shop owners
create policy "Public Access Cracker Videos" on storage.objects
  for select using (bucket_id = 'cracker-videos');

create policy "Allow Upload Cracker Videos" on storage.objects
  for insert with check (bucket_id = 'cracker-videos');

create policy "Allow Update Cracker Videos" on storage.objects
  for update using (bucket_id = 'cracker-videos');

create policy "Allow Delete Cracker Videos" on storage.objects
  for delete using (bucket_id = 'cracker-videos');

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- For a shared internal shop tool protected by a physical PIN lock on counter devices,
-- we allow read/write access via the Supabase client anon key.
alter table public.products enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.requested_items enable row level security;
alter table public.settings enable row level security;

create policy "Anon full access products" on public.products for all using (true) with check (true);
create policy "Anon full access bills" on public.bills for all using (true) with check (true);
create policy "Anon full access bill_items" on public.bill_items for all using (true) with check (true);
create policy "Anon full access requested_items" on public.requested_items for all using (true) with check (true);
create policy "Anon full access settings" on public.settings for all using (true) with check (true);

-- 8. INITIAL SEED SAMPLE PRODUCTS
insert into public.products (id, name, category, price, quantity, unit, low_stock_level, qr_code)
values
  ('11111111-1111-1111-1111-111111111101', '30 SHOT MULTI COLOR', 'Aerial Shots', 750.00, 25, 'box', 5, 'CRK-30SHOT'),
  ('11111111-1111-1111-1111-111111111102', 'Twister', 'Fountains', 270.00, 30, 'box', 8, 'CRK-TWISTER'),
  ('11111111-1111-1111-1111-111111111103', 'Twix/Jelly Pops', 'Novelty', 220.00, 40, 'box', 10, 'CRK-JELLYPOP'),
  ('11111111-1111-1111-1111-111111111104', 'Pogaya Podu', 'Smoke & Color', 270.00, 35, 'box', 8, 'CRK-POGAYA'),
  ('11111111-1111-1111-1111-111111111105', '30CM COLOR SPARKLERS', 'Sparklers', 80.00, 85, 'box', 20, 'CRK-SPK30CM'),
  ('11111111-1111-1111-1111-111111111106', '15CM COLOR SPARKLERS', 'Sparklers', 65.00, 90, 'box', 25, 'CRK-SPK15CM'),
  ('11111111-1111-1111-1111-111111111107', 'Flower POT Super Colour koti', 'Flower Pots', 350.00, 18, 'box', 10, 'CRK-POTKOTI'),
  ('11111111-1111-1111-1111-111111111108', '12 Shot Raider', 'Aerial Shots', 270.00, 22, 'box', 6, 'CRK-12RAIDER'),
  ('11111111-1111-1111-1111-111111111109', 'Whistle podu', 'Novelty', 220.00, 28, 'box', 8, 'CRK-WHISTLE'),
  ('11111111-1111-1111-1111-111111111110', '1000 Wala Garland', 'Garlands', 480.00, 4, 'box', 10, 'CRK-1000WALA')
on conflict (qr_code) do nothing;
