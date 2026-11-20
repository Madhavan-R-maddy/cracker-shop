import { createClient } from '@supabase/supabase-js';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env) ? process.env : {};
const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your-project-id')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function assertSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
  }
}

// ----------------------------------------------------------------------
// 1. PIN & SETTINGS AUTHENTICATION
// ----------------------------------------------------------------------

/**
 * Fetches the fresh PIN hash directly from Supabase settings.
 * Never uses cached, fallback, or hardcoded hashes.
 */
export async function getFreshPinHash() {
  assertSupabase();
  const { data, error } = await supabase
    .from('settings')
    .select('pin_hash')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Error fetching PIN hash from Supabase settings:', error);
    throw new Error(`Failed to load security settings: ${error.message}`);
  }

  if (!data?.pin_hash) {
    throw new Error('No PIN hash found in database settings. Please run migration script.');
  }

  return data.pin_hash;
}

/**
 * Updates the PIN hash in Supabase settings and verifies success.
 */
export async function updatePinHash(newHash) {
  assertSupabase();
  const { data, error } = await supabase
    .from('settings')
    .update({ 
      pin_hash: newHash, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', 1)
    .select()
    .single();

  if (error) {
    console.error('Failed to update PIN hash in Supabase:', error);
    throw new Error(`Database error changing PIN: ${error.message}`);
  }

  return data;
}

export async function getSettings() {
  assertSupabase();
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('Failed to get settings:', error);
    throw new Error(`Error loading settings: ${error.message}`);
  }

  return data;
}

export async function updateSettings(updates) {
  assertSupabase();
  const { data, error } = await supabase
    .from('settings')
    .upsert({ 
      id: 1, 
      ...updates, 
      updated_at: new Date().toISOString() 
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to update settings:', error);
    throw new Error(`Error saving settings: ${error.message}`);
  }

  return data;
}

// ----------------------------------------------------------------------
// 2. PRODUCTS (CRACKERS INVENTORY)
// ----------------------------------------------------------------------

export async function getProducts() {
  assertSupabase();
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch products:', error);
    throw new Error(`Error loading products: ${error.message}`);
  }

  return data || [];
}

export async function addProduct(product) {
  assertSupabase();
  const newProduct = {
    ...product,
    id: product.id || crypto.randomUUID(),
    quantity: Math.max(0, parseInt(product.quantity, 10) || 0),
    price: Math.max(0, parseFloat(product.price) || 0),
    low_stock_level: Math.max(0, parseInt(product.low_stock_level, 10) || 10),
    qr_code: product.qr_code || `CRK-${Date.now().toString(36).toUpperCase()}`,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('products')
    .insert([newProduct])
    .select()
    .single();

  if (error) {
    console.error('Failed to add product:', error);
    throw new Error(`Error creating product: ${error.message}`);
  }

  return data;
}

/**
 * Batch insert multiple new crackers into Supabase products table.
 */
export async function addProductsBatch(productsList) {
  assertSupabase();
  if (!productsList || productsList.length === 0) return [];

  const timestamp = Date.now().toString(36).toUpperCase();
  const formatted = productsList.map((p, idx) => ({
    name: p.name.trim(),
    category: p.category || 'General',
    price: Math.max(0, parseFloat(p.price) || 0),
    quantity: Math.max(0, parseInt(p.quantity, 10) || 0),
    unit: p.unit || 'box',
    low_stock_level: Math.max(0, parseInt(p.low_stock_level, 10) || 10),
    video_url: p.video_url || '',
    qr_code: p.qr_code || `CRK-${timestamp}-${idx}-${Math.floor(Math.random() * 10000)}`
  }));

  const { data, error } = await supabase
    .from('products')
    .insert(formatted)
    .select();

  if (error) {
    console.error('Failed to batch insert products:', error);
    throw new Error(`Error importing new crackers: ${error.message}`);
  }

  return data;
}

export async function updateProduct(id, updates) {
  assertSupabase();
  const payload = { ...updates };
  if (payload.quantity !== undefined) {
    payload.quantity = Math.max(0, parseInt(payload.quantity, 10) || 0);
  }
  if (payload.price !== undefined) {
    payload.price = Math.max(0, parseFloat(payload.price) || 0);
  }

  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update product:', error);
    throw new Error(`Error updating product: ${error.message}`);
  }

  return data;
}

export async function deleteProduct(id) {
  assertSupabase();
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete product:', error);
    throw new Error(`Error deleting product: ${error.message}`);
  }

  return true;
}

/**
 * Bulk deletes multiple crackers in a single Supabase query.
 */
export async function deleteProducts(ids) {
  assertSupabase();
  if (!ids || ids.length === 0) return true;

  const { error } = await supabase
    .from('products')
    .delete()
    .in('id', ids);

  if (error) {
    console.error('Failed to delete selected products:', error);
    throw new Error(`Database error deleting selected crackers: ${error.message}`);
  }

  return true;
}

/**
 * Deletes all crackers from the products table in a single Supabase query.
 * Old bills and customer records remain completely intact.
 */
export async function deleteAllProducts() {
  assertSupabase();
  // PostgREST requires at least one filter on DELETE - neq 00000000... matches all valid UUIDs
  const { error } = await supabase
    .from('products')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Failed to delete all products:', error);
    throw new Error(`Database error deleting all stock: ${error.message}`);
  }

  return true;
}

// ----------------------------------------------------------------------
// 3. BILLS & ATOMIC STOCK OPERATIONS
// ----------------------------------------------------------------------

export async function getBills() {
  assertSupabase();
  const { data: bills, error } = await supabase
    .from('bills')
    .select('*, bill_items(*)')
    .order('bill_date', { ascending: false });

  if (error) {
    console.error('Failed to get bills:', error);
    throw new Error(`Error loading bills history: ${error.message}`);
  }

  return (bills || []).map(b => ({
    ...b,
    items: b.bill_items || []
  }));
}

function isMissingRpcError(err) {
  if (!err) return false;
  return (
    err.code === 'PGRST202' ||
    err.status === 404 ||
    err.message?.toLowerCase().includes('could not find') ||
    err.message?.toLowerCase().includes('does not exist') ||
    err.message?.toLowerCase().includes('schema cache')
  );
}

/**
 * Creates a bill and reduces product stock atomically.
 * Uses the Supabase RPC function `create_bill_with_stock` if available,
 * falling back to verified sequence if RPC is not deployed yet.
 */
export async function createBill(billData, items) {
  assertSupabase();

  const billId = billData.id || crypto.randomUUID();
  const formattedBill = {
    id: billId,
    bill_number: billData.bill_number,
    customer_name: billData.customer_name,
    place: billData.place || '',
    bill_date: billData.bill_date || new Date().toISOString(),
    subtotal: billData.subtotal,
    discount_percent: billData.discount_percent || 0,
    discount_amount: billData.discount_amount || 0,
    final_total: billData.final_total,
    created_at: new Date().toISOString()
  };

  const formattedItems = items.map(item => ({
    id: item.id || crypto.randomUUID(),
    bill_id: billId,
    product_id: item.product_id || null,
    product_name: item.name || item.product_name,
    rate: item.rate,
    quantity: item.quantity || item.qty,
    total: item.rate * (item.quantity || item.qty)
  }));

  // Try RPC first (Atomic PostgreSQL transaction)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_bill_with_stock', {
      bill_data: formattedBill,
      items_data: formattedItems
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }
    if (rpcError && !isMissingRpcError(rpcError)) {
      throw rpcError;
    }
  } catch (rpcErr) {
    if (!isMissingRpcError(rpcErr)) {
      throw new Error(`Failed to save bill: ${rpcErr.message}`);
    }
  }

  // Fallback sequential execution if RPC has not been migrated yet
  const { error: billErr } = await supabase.from('bills').insert([formattedBill]);
  if (billErr) {
    throw new Error(`Failed to save bill: ${billErr.message}`);
  }

  if (formattedItems.length > 0) {
    const { error: itemErr } = await supabase.from('bill_items').insert(formattedItems);
    if (itemErr) {
      throw new Error(`Failed to save bill items: ${itemErr.message}`);
    }
  }

  // Deduct stock for each product
  for (const item of formattedItems) {
    if (item.product_id) {
      const { data: prod, error: prodErr } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', item.product_id)
        .single();

      if (!prodErr && prod) {
        const newQty = Math.max(0, (prod.quantity || 0) - item.quantity);
        const { error: updateErr } = await supabase
          .from('products')
          .update({ quantity: newQty })
          .eq('id', item.product_id);
        if (updateErr) {
          console.warn('Stock reduction error for item:', item.product_name, updateErr);
        }
      }
    }
  }

  return { ...formattedBill, items: formattedItems };
}

/**
 * Deletes a bill and restores its stock quantities atomically.
 */
export async function deleteBill(billId, items) {
  assertSupabase();

  // Try RPC first (Atomic PostgreSQL transaction)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('delete_bill_and_restore_stock', {
      p_bill_id: billId
    });

    if (!rpcError) {
      return true;
    }
    if (rpcError && !isMissingRpcError(rpcError)) {
      throw rpcError;
    }
  } catch (rpcErr) {
    if (!isMissingRpcError(rpcErr)) {
      throw new Error(`Failed to delete bill: ${rpcErr.message}`);
    }
  }

  // Fallback sequential execution
  let itemsToRestore = items;
  if (!itemsToRestore || itemsToRestore.length === 0) {
    const { data: fetchedItems, error: itemsErr } = await supabase
      .from('bill_items')
      .select('*')
      .eq('bill_id', billId);
    if (itemsErr) throw new Error(`Could not fetch items to restore stock: ${itemsErr.message}`);
    itemsToRestore = fetchedItems || [];
  }

  // 1. Restore stock
  for (const item of itemsToRestore) {
    if (item.product_id) {
      const { data: prod } = await supabase
        .from('products')
        .select('quantity')
        .eq('id', item.product_id)
        .single();
      if (prod) {
        await supabase
          .from('products')
          .update({ quantity: (prod.quantity || 0) + (item.quantity || 0) })
          .eq('id', item.product_id);
      }
    }
  }

  // 2. Delete bill items
  await supabase.from('bill_items').delete().eq('bill_id', billId);

  // 3. Delete bill
  const { error: deleteErr } = await supabase.from('bills').delete().eq('id', billId);
  if (deleteErr) {
    throw new Error(`Failed to delete bill: ${deleteErr.message}`);
  }

  return true;
}

/**
 * Updates an existing bill and adjusts stock deltas atomically.
 */
export async function updateBill(billId, updatedBillData, newItems, oldItems) {
  assertSupabase();

  const formattedItems = newItems.map(item => ({
    id: item.id || crypto.randomUUID(),
    bill_id: billId,
    product_id: item.product_id || null,
    product_name: item.name || item.product_name,
    rate: item.rate,
    quantity: item.quantity || item.qty,
    total: item.rate * (item.quantity || item.qty)
  }));

  // Try RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_bill_with_stock', {
      p_bill_id: billId,
      bill_data: updatedBillData,
      items_data: formattedItems
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }
    if (rpcError && !isMissingRpcError(rpcError)) {
      throw rpcError;
    }
  } catch (rpcErr) {
    if (!isMissingRpcError(rpcErr)) {
      throw new Error(`Failed to update bill: ${rpcErr.message}`);
    }
  }

  // Fallback sequential execution
  const productDeltas = {};
  (oldItems || []).forEach(item => {
    if (item.product_id) {
      productDeltas[item.product_id] = (productDeltas[item.product_id] || 0) + (item.quantity || 0);
    }
  });

  (newItems || []).forEach(item => {
    if (item.product_id) {
      productDeltas[item.product_id] = (productDeltas[item.product_id] || 0) - (item.quantity || 0);
    }
  });

  const { error: billUpdateErr } = await supabase.from('bills').update({
    customer_name: updatedBillData.customer_name,
    place: updatedBillData.place,
    bill_date: updatedBillData.bill_date,
    subtotal: updatedBillData.subtotal,
    discount_percent: updatedBillData.discount_percent,
    discount_amount: updatedBillData.discount_amount,
    final_total: updatedBillData.final_total
  }).eq('id', billId);

  if (billUpdateErr) {
    throw new Error(`Failed to update bill details: ${billUpdateErr.message}`);
  }

  // Replace bill items
  await supabase.from('bill_items').delete().eq('bill_id', billId);
  const { error: insertItemsErr } = await supabase.from('bill_items').insert(formattedItems);
  if (insertItemsErr) {
    throw new Error(`Failed to update bill items: ${insertItemsErr.message}`);
  }

  // Apply stock deltas
  for (const [prodId, delta] of Object.entries(productDeltas)) {
    const { data: prod } = await supabase.from('products').select('quantity').eq('id', prodId).single();
    if (prod) {
      const updatedQty = Math.max(0, (prod.quantity || 0) + delta);
      await supabase.from('products').update({ quantity: updatedQty }).eq('id', prodId);
    }
  }

  return true;
}

// ----------------------------------------------------------------------
// 4. REQUESTED ITEMS (Customer asked for)
// ----------------------------------------------------------------------

export async function getRequestedItems() {
  assertSupabase();
  const { data, error } = await supabase
    .from('requested_items')
    .select('*')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Failed to get requested items:', error);
    throw new Error(`Error loading requested items: ${error.message}`);
  }

  return data || [];
}

export async function addRequestedItem(name) {
  assertSupabase();
  const item = {
    id: crypto.randomUUID(),
    name: name.trim(),
    requested_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('requested_items')
    .insert([item])
    .select()
    .single();

  if (error) {
    console.error('Failed to add requested item:', error);
    throw new Error(`Error saving requested item: ${error.message}`);
  }

  return data;
}

// ----------------------------------------------------------------------
// 5. STORAGE UPLOAD FOR DEMO VIDEOS
// ----------------------------------------------------------------------

export async function uploadDemoVideo(file) {
  assertSupabase();
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const filePath = `demos/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('cracker-videos')
    .upload(filePath, file);

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from('cracker-videos')
    .getPublicUrl(filePath);

  return data.publicUrl;
}
