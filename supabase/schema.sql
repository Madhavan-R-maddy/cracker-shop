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

-- 8. PERMISSIONS & GRANTS
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO anon, authenticated, service_role;

-- 9. ATOMIC RPC TRANSACTIONS
CREATE OR REPLACE FUNCTION public.create_bill_with_stock(
  bill_data jsonb,
  items_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_rate numeric;
  v_item_total numeric;
  v_product_name text;
  v_created_bill jsonb;
BEGIN
  v_bill_id := COALESCE((bill_data->>'id')::uuid, gen_random_uuid());

  INSERT INTO public.bills (
    id, bill_number, customer_name, place, bill_date,
    subtotal, discount_percent, discount_amount, final_total, created_at
  ) VALUES (
    v_bill_id,
    bill_data->>'bill_number',
    bill_data->>'customer_name',
    COALESCE(bill_data->>'place', ''),
    COALESCE((bill_data->>'bill_date')::timestamptz, now()),
    COALESCE((bill_data->>'subtotal')::numeric, 0),
    COALESCE((bill_data->>'discount_percent')::numeric, 0),
    COALESCE((bill_data->>'discount_amount')::numeric, 0),
    COALESCE((bill_data->>'final_total')::numeric, 0),
    COALESCE((bill_data->>'created_at')::timestamptz, now())
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    v_product_id := CASE 
      WHEN v_item->>'product_id' IS NOT NULL AND v_item->>'product_id' <> '' 
      THEN (v_item->>'product_id')::uuid 
      ELSE NULL 
    END;
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::integer, (v_item->>'qty')::integer, 1));
    v_rate := COALESCE((v_item->>'rate')::numeric, 0);
    v_item_total := COALESCE((v_item->>'total')::numeric, v_rate * v_qty);
    v_product_name := COALESCE(v_item->>'product_name', v_item->>'name', 'Unknown Item');

    INSERT INTO public.bill_items (
      id, bill_id, product_id, product_name, rate, quantity, total
    ) VALUES (
      COALESCE((v_item->>'id')::uuid, gen_random_uuid()),
      v_bill_id, v_product_id, v_product_name, v_rate, v_qty, v_item_total
    );

    IF v_product_id IS NOT NULL THEN
      UPDATE public.products
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'id', b.id,
    'bill_number', b.bill_number,
    'customer_name', b.customer_name,
    'place', b.place,
    'bill_date', b.bill_date,
    'subtotal', b.subtotal,
    'discount_percent', b.discount_percent,
    'discount_amount', b.discount_amount,
    'final_total', b.final_total,
    'created_at', b.created_at,
    'items', (
      SELECT jsonb_agg(bi.*)
      FROM public.bill_items bi
      WHERE bi.bill_id = b.id
    )
  ) INTO v_created_bill
  FROM public.bills b
  WHERE b.id = v_bill_id;

  RETURN v_created_bill;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_bill_and_restore_stock(
  p_bill_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item record;
BEGIN
  FOR v_item IN 
    SELECT product_id, quantity 
    FROM public.bill_items 
    WHERE bill_id = p_bill_id AND product_id IS NOT NULL
  LOOP
    UPDATE public.products
    SET quantity = quantity + v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  DELETE FROM public.bill_items WHERE bill_id = p_bill_id;
  DELETE FROM public.bills WHERE id = p_bill_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bill_with_stock(
  p_bill_id uuid,
  bill_data jsonb,
  items_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item record;
  v_new_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_rate numeric;
  v_item_total numeric;
  v_product_name text;
  v_updated_bill jsonb;
BEGIN
  FOR v_item IN 
    SELECT product_id, quantity 
    FROM public.bill_items 
    WHERE bill_id = p_bill_id AND product_id IS NOT NULL
  LOOP
    UPDATE public.products
    SET quantity = quantity + v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  DELETE FROM public.bill_items WHERE bill_id = p_bill_id;

  UPDATE public.bills SET
    customer_name = bill_data->>'customer_name',
    place = COALESCE(bill_data->>'place', ''),
    bill_date = COALESCE((bill_data->>'bill_date')::timestamptz, bill_date),
    subtotal = COALESCE((bill_data->>'subtotal')::numeric, 0),
    discount_percent = COALESCE((bill_data->>'discount_percent')::numeric, 0),
    discount_amount = COALESCE((bill_data->>'discount_amount')::numeric, 0),
    final_total = COALESCE((bill_data->>'final_total')::numeric, 0)
  WHERE id = p_bill_id;

  FOR v_new_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    v_product_id := CASE 
      WHEN v_new_item->>'product_id' IS NOT NULL AND v_new_item->>'product_id' <> '' 
      THEN (v_new_item->>'product_id')::uuid 
      ELSE NULL 
    END;
    v_qty := GREATEST(1, COALESCE((v_new_item->>'quantity')::integer, (v_new_item->>'qty')::integer, 1));
    v_rate := COALESCE((v_new_item->>'rate')::numeric, 0);
    v_item_total := COALESCE((v_new_item->>'total')::numeric, v_rate * v_qty);
    v_product_name := COALESCE(v_new_item->>'product_name', v_new_item->>'name', 'Unknown Item');

    INSERT INTO public.bill_items (
      id, bill_id, product_id, product_name, rate, quantity, total
    ) VALUES (
      COALESCE((v_new_item->>'id')::uuid, gen_random_uuid()),
      p_bill_id, v_product_id, v_product_name, v_rate, v_qty, v_item_total
    );

    IF v_product_id IS NOT NULL THEN
      UPDATE public.products
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'id', b.id,
    'bill_number', b.bill_number,
    'customer_name', b.customer_name,
    'place', b.place,
    'bill_date', b.bill_date,
    'subtotal', b.subtotal,
    'discount_percent', b.discount_percent,
    'discount_amount', b.discount_amount,
    'final_total', b.final_total,
    'created_at', b.created_at,
    'items', (
      SELECT jsonb_agg(bi.*)
      FROM public.bill_items bi
      WHERE bi.bill_id = b.id
    )
  ) INTO v_updated_bill
  FROM public.bills b
  WHERE b.id = p_bill_id;

  RETURN v_updated_bill;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bill_with_stock(jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_bill_and_restore_stock(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_bill_with_stock(uuid, jsonb, jsonb) TO anon, authenticated, service_role;
