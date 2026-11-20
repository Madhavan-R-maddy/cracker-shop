-- ==============================================================================
-- SRI SENTHUR PATTASU KADAI - COMPLETE DATABASE MIGRATION
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. GRANT SCHEMA, TABLE, SEQUENCE, AND FUNCTION PERMISSIONS TO ANON & AUTHENTICATED
-- Fixes: "permission denied for table bills" and persistence issues
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Set matching default privileges for any future tables/sequences/functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO anon, authenticated, service_role;

-- 2. ENSURE RLS POLICIES ALLOW SHARED COUNTER ACCESS
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.requested_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon full access products" ON public.products;
CREATE POLICY "Anon full access products" ON public.products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access bills" ON public.bills;
CREATE POLICY "Anon full access bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access bill_items" ON public.bill_items;
CREATE POLICY "Anon full access bill_items" ON public.bill_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access requested_items" ON public.requested_items;
CREATE POLICY "Anon full access requested_items" ON public.requested_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access settings" ON public.settings;
CREATE POLICY "Anon full access settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- 3. ATOMIC TRANSACTION RPC: CREATE BILL AND DEDUCT STOCK
-- Ensures bill, items, and stock updates succeed together. Stock never drops below 0.
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
  -- Generate bill ID if not provided
  v_bill_id := COALESCE((bill_data->>'id')::uuid, gen_random_uuid());

  -- 1. Insert bill
  INSERT INTO public.bills (
    id,
    bill_number,
    customer_name,
    place,
    bill_date,
    subtotal,
    discount_percent,
    discount_amount,
    final_total,
    created_at
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

  -- 2. Insert bill items and deduct stock
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
      id,
      bill_id,
      product_id,
      product_name,
      rate,
      quantity,
      total
    ) VALUES (
      COALESCE((v_item->>'id')::uuid, gen_random_uuid()),
      v_bill_id,
      v_product_id,
      v_product_name,
      v_rate,
      v_qty,
      v_item_total
    );

    -- Deduct stock if linked to product; stock never drops below 0
    IF v_product_id IS NOT NULL THEN
      UPDATE public.products
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  -- 3. Return created bill with items
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

-- 4. ATOMIC TRANSACTION RPC: DELETE BILL AND RESTORE STOCK
-- Deleting a bill safely restores all cracker quantities and removes bill + bill_items.
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
  -- 1. Restore stock for each item linked to a product
  FOR v_item IN 
    SELECT product_id, quantity 
    FROM public.bill_items 
    WHERE bill_id = p_bill_id AND product_id IS NOT NULL
  LOOP
    UPDATE public.products
    SET quantity = quantity + v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  -- 2. Delete bill items
  DELETE FROM public.bill_items WHERE bill_id = p_bill_id;

  -- 3. Delete bill
  DELETE FROM public.bills WHERE id = p_bill_id;

  RETURN true;
END;
$$;

-- 5. ATOMIC TRANSACTION RPC: UPDATE BILL AND ADJUST STOCK
-- Restores old item stock, applies updates, records new items, and deducts new stock.
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
  -- 1. Restore stock from existing bill items
  FOR v_item IN 
    SELECT product_id, quantity 
    FROM public.bill_items 
    WHERE bill_id = p_bill_id AND product_id IS NOT NULL
  LOOP
    UPDATE public.products
    SET quantity = quantity + v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  -- 2. Delete old bill items
  DELETE FROM public.bill_items WHERE bill_id = p_bill_id;

  -- 3. Update bill header
  UPDATE public.bills SET
    customer_name = bill_data->>'customer_name',
    place = COALESCE(bill_data->>'place', ''),
    bill_date = COALESCE((bill_data->>'bill_date')::timestamptz, bill_date),
    subtotal = COALESCE((bill_data->>'subtotal')::numeric, 0),
    discount_percent = COALESCE((bill_data->>'discount_percent')::numeric, 0),
    discount_amount = COALESCE((bill_data->>'discount_amount')::numeric, 0),
    final_total = COALESCE((bill_data->>'final_total')::numeric, 0)
  WHERE id = p_bill_id;

  -- 4. Insert new bill items and deduct new stock
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
      id,
      bill_id,
      product_id,
      product_name,
      rate,
      quantity,
      total
    ) VALUES (
      COALESCE((v_new_item->>'id')::uuid, gen_random_uuid()),
      p_bill_id,
      v_product_id,
      v_product_name,
      v_rate,
      v_qty,
      v_item_total
    );

    IF v_product_id IS NOT NULL THEN
      UPDATE public.products
      SET quantity = GREATEST(0, quantity - v_qty)
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  -- 5. Return updated bill with items
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

-- Grant execute permissions on RPC functions to anon, authenticated, service_role
GRANT EXECUTE ON FUNCTION public.create_bill_with_stock(jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_bill_and_restore_stock(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_bill_with_stock(uuid, jsonb, jsonb) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. REMOVE SAMPLE DATA FROM SUPABASE
-- Run this to clear out test bill INV-2026-0418 and the initial 10 seed crackers
-- ==============================================================================
DELETE FROM public.bills WHERE bill_number = 'INV-2026-0418';

DELETE FROM public.products WHERE qr_code IN (
  'CRK-30SHOT', 'CRK-TWISTER', 'CRK-JELLYPOP', 'CRK-POGAYA',
  'CRK-SPK30CM', 'CRK-SPK15CM', 'CRK-POTKOTI', 'CRK-12RAIDER',
  'CRK-WHISTLE', 'CRK-1000WALA'
) OR id::text LIKE '11111111-1111-1111-1111-1111111111%';
