import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your-project-id')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Initial 10 Sivakasi Cracker varieties matching user invoice and store stock
export const SEED_PRODUCTS = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    name: '30 SHOT MULTI COLOR',
    category: 'Aerial Shots',
    price: 750,
    quantity: 25,
    unit: 'box',
    low_stock_level: 5,
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    qr_code: 'CRK-30SHOT',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111102',
    name: 'Twister',
    category: 'Fountains',
    price: 270,
    quantity: 30,
    unit: 'box',
    low_stock_level: 8,
    video_url: '',
    qr_code: 'CRK-TWISTER',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111103',
    name: 'Twix/Jelly Pops',
    category: 'Novelty',
    price: 220,
    quantity: 40,
    unit: 'box',
    low_stock_level: 10,
    video_url: '',
    qr_code: 'CRK-JELLYPOP',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111104',
    name: 'Pogaya Podu',
    category: 'Smoke & Color',
    price: 270,
    quantity: 35,
    unit: 'box',
    low_stock_level: 8,
    video_url: '',
    qr_code: 'CRK-POGAYA',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111105',
    name: '30CM COLOR SPARKLERS',
    category: 'Sparklers',
    price: 80,
    quantity: 85,
    unit: 'box',
    low_stock_level: 20,
    video_url: '',
    qr_code: 'CRK-SPK30CM',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111106',
    name: '15CM COLOR SPARKLERS',
    category: 'Sparklers',
    price: 65,
    quantity: 90,
    unit: 'box',
    low_stock_level: 25,
    video_url: '',
    qr_code: 'CRK-SPK15CM',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111107',
    name: 'Flower POT Super Colour koti',
    category: 'Flower Pots',
    price: 350,
    quantity: 18,
    unit: 'box',
    low_stock_level: 10,
    video_url: '',
    qr_code: 'CRK-POTKOTI',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111108',
    name: '12 Shot Raider',
    category: 'Aerial Shots',
    price: 270,
    quantity: 22,
    unit: 'box',
    low_stock_level: 6,
    video_url: '',
    qr_code: 'CRK-12RAIDER',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111109',
    name: 'Whistle podu',
    category: 'Novelty',
    price: 220,
    quantity: 28,
    unit: 'box',
    low_stock_level: 8,
    video_url: '',
    qr_code: 'CRK-WHISTLE',
    created_at: new Date().toISOString()
  },
  {
    id: '11111111-1111-1111-1111-111111111110',
    name: '1000 Wala Garland',
    category: 'Garlands',
    price: 480,
    quantity: 4, // Below low_stock_level to trigger alert
    unit: 'box',
    low_stock_level: 10,
    video_url: '',
    qr_code: 'CRK-1000WALA',
    created_at: new Date().toISOString()
  }
];

// In-memory fallback cache when running prior to connecting live Supabase credentials
let fallbackProducts = [...SEED_PRODUCTS];
let fallbackBills = [
  {
    id: 'bill-demo-01',
    bill_number: 'INV-2026-0418',
    customer_name: 'Govindraj',
    place: 'Salem',
    bill_date: new Date(Date.now() - 3600000 * 2).toISOString(),
    subtotal: 2640,
    discount_percent: 0,
    discount_amount: 0,
    final_total: 2640,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    items: [
      { id: 'bi-1', product_name: '30 SHOT MULTI COLOR', rate: 750, quantity: 1, total: 750 },
      { id: 'bi-2', product_name: 'Twister', rate: 270, quantity: 1, total: 270 },
      { id: 'bi-3', product_name: 'Twix/Jelly Pops', rate: 220, quantity: 1, total: 220 },
      { id: 'bi-4', product_name: 'Pogaya Podu', rate: 270, quantity: 1, total: 270 },
      { id: 'bi-5', product_name: '30CM COLOR SPARKLERS', rate: 80, quantity: 2, total: 160 },
      { id: 'bi-6', product_name: '15CM COLOR SPARKLERS', rate: 65, quantity: 2, total: 130 },
      { id: 'bi-7', product_name: 'Flower POT Super Colour koti', rate: 350, quantity: 1, total: 350 },
      { id: 'bi-8', product_name: '12 Shot Raider', rate: 270, quantity: 1, total: 270 },
      { id: 'bi-9', product_name: 'Whistle podu', rate: 220, quantity: 1, total: 220 }
    ]
  }
];
let fallbackRequested = [
  { id: 'req-1', name: 'Peacock Fountain 5-in-1', requested_at: new Date().toISOString() },
  { id: 'req-2', name: 'Digital Sound 5000 Wala', requested_at: new Date().toISOString() },
  { id: 'req-3', name: 'Peacock Fountain 5-in-1', requested_at: new Date().toISOString() }
];
let fallbackSettings = {
  id: 1,
  total_investment: 150000,
  pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4' // 1234
};

// ----------------------------------------------------------------------
// DATA ACCESS FUNCTIONS
// ----------------------------------------------------------------------

// 1. PRODUCTS
export async function getProducts() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });
    if (!error && data) {
      if (data.length === 0) {
        // Seed if empty
        await seedProducts();
        return SEED_PRODUCTS;
      }
      return data;
    }
    console.warn('Supabase fetch failed, falling back to memory state:', error);
  }
  return [...fallbackProducts];
}

export async function addProduct(product) {
  const newProduct = {
    ...product,
    id: product.id || crypto.randomUUID(),
    quantity: Math.max(0, parseInt(product.quantity, 10) || 0),
    price: Math.max(0, parseFloat(product.price) || 0),
    low_stock_level: Math.max(0, parseInt(product.low_stock_level, 10) || 10),
    qr_code: product.qr_code || `CRK-${Date.now().toString(36).toUpperCase()}`,
    created_at: new Date().toISOString()
  };

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('products')
      .insert([newProduct])
      .select()
      .single();
    if (!error && data) return data;
  }
  fallbackProducts.push(newProduct);
  return newProduct;
}

export async function updateProduct(id, updates) {
  if (updates.quantity !== undefined) {
    updates.quantity = Math.max(0, parseInt(updates.quantity, 10) || 0);
  }
  if (updates.price !== undefined) {
    updates.price = Math.max(0, parseFloat(updates.price) || 0);
  }

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) return data;
  }

  fallbackProducts = fallbackProducts.map(p => p.id === id ? { ...p, ...updates } : p);
  return fallbackProducts.find(p => p.id === id);
}

export async function deleteProduct(id) {
  if (isSupabaseConfigured) {
    await supabase.from('products').delete().eq('id', id);
  }
  fallbackProducts = fallbackProducts.filter(p => p.id !== id);
  return true;
}

export async function seedProducts() {
  if (isSupabaseConfigured) {
    await supabase.from('products').upsert(SEED_PRODUCTS, { onConflict: 'qr_code' });
  }
  fallbackProducts = [...SEED_PRODUCTS];
  return fallbackProducts;
}

// 2. BILLS & STOCK UPDATES
export async function getBills() {
  if (isSupabaseConfigured) {
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*, bill_items(*)')
      .order('bill_date', { ascending: false });

    if (!error && bills) {
      return bills.map(b => ({
        ...b,
        items: b.bill_items || []
      }));
    }
  }
  return [...fallbackBills].sort((a, b) => new Date(b.bill_date) - new Date(a.bill_date));
}

export async function createBill(billData, items) {
  const billId = crypto.randomUUID();
  const newBill = {
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
    id: crypto.randomUUID(),
    bill_id: billId,
    product_id: item.product_id || null,
    product_name: item.name || item.product_name,
    rate: item.rate,
    quantity: item.quantity || item.qty,
    total: item.rate * (item.quantity || item.qty)
  }));

  // 1. Save Bill and Bill Items
  if (isSupabaseConfigured) {
    const { error: billErr } = await supabase.from('bills').insert([newBill]);
    if (billErr) throw billErr;
    if (formattedItems.length > 0) {
      const { error: itemErr } = await supabase.from('bill_items').insert(formattedItems);
      if (itemErr) throw itemErr;
    }
    // 2. Reduce Stock in Supabase
    for (const item of formattedItems) {
      if (item.product_id) {
        const { data: prod } = await supabase.from('products').select('quantity').eq('id', item.product_id).single();
        if (prod) {
          const newQty = Math.max(0, (prod.quantity || 0) - item.quantity);
          await supabase.from('products').update({ quantity: newQty }).eq('id', item.product_id);
        }
      }
    }
  } else {
    // Memory fallback
    for (const item of formattedItems) {
      if (item.product_id) {
        fallbackProducts = fallbackProducts.map(p => {
          if (p.id === item.product_id) {
            return { ...p, quantity: Math.max(0, (p.quantity || 0) - item.quantity) };
          }
          return p;
        });
      }
    }
    fallbackBills.unshift({ ...newBill, items: formattedItems });
  }

  return { ...newBill, items: formattedItems };
}

export async function updateBill(billId, updatedBillData, newItems, oldItems) {
  // Compute stock delta:
  // oldItems gave X, newItems give Y -> delta = old - new (if old 5 and new 3, restore 2; if old 3 and new 5, reduce 2)
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

  if (isSupabaseConfigured) {
    await supabase.from('bills').update({
      customer_name: updatedBillData.customer_name,
      place: updatedBillData.place,
      bill_date: updatedBillData.bill_date,
      subtotal: updatedBillData.subtotal,
      discount_percent: updatedBillData.discount_percent,
      discount_amount: updatedBillData.discount_amount,
      final_total: updatedBillData.final_total
    }).eq('id', billId);

    // Replace bill items
    await supabase.from('bill_items').delete().eq('bill_id', billId);
    const formattedItems = newItems.map(item => ({
      id: crypto.randomUUID(),
      bill_id: billId,
      product_id: item.product_id || null,
      product_name: item.name || item.product_name,
      rate: item.rate,
      quantity: item.quantity || item.qty,
      total: item.rate * (item.quantity || item.qty)
    }));
    await supabase.from('bill_items').insert(formattedItems);

    // Apply stock deltas
    for (const [prodId, delta] of Object.entries(productDeltas)) {
      const { data: prod } = await supabase.from('products').select('quantity').eq('id', prodId).single();
      if (prod) {
        const updatedQty = Math.max(0, (prod.quantity || 0) + delta);
        await supabase.from('products').update({ quantity: updatedQty }).eq('id', prodId);
      }
    }
  } else {
    // Memory fallback
    for (const [prodId, delta] of Object.entries(productDeltas)) {
      fallbackProducts = fallbackProducts.map(p => {
        if (p.id === prodId) {
          return { ...p, quantity: Math.max(0, (p.quantity || 0) + delta) };
        }
        return p;
      });
    }

    const formattedItems = newItems.map(item => ({
      id: item.id || crypto.randomUUID(),
      bill_id: billId,
      product_id: item.product_id || null,
      product_name: item.name || item.product_name,
      rate: item.rate,
      quantity: item.quantity || item.qty,
      total: item.rate * (item.quantity || item.qty)
    }));

    fallbackBills = fallbackBills.map(b => b.id === billId ? {
      ...b,
      ...updatedBillData,
      items: formattedItems
    } : b);
  }

  return true;
}

export async function deleteBill(billId, items) {
  // Deleting a bill restores the stock quantities!
  if (isSupabaseConfigured) {
    // Fetch items if not provided
    let itemsToRestore = items;
    if (!itemsToRestore || itemsToRestore.length === 0) {
      const { data } = await supabase.from('bill_items').select('*').eq('bill_id', billId);
      itemsToRestore = data || [];
    }

    // Restore stock
    for (const item of itemsToRestore) {
      if (item.product_id) {
        const { data: prod } = await supabase.from('products').select('quantity').eq('id', item.product_id).single();
        if (prod) {
          await supabase.from('products').update({
            quantity: (prod.quantity || 0) + (item.quantity || 0)
          }).eq('id', item.product_id);
        }
      }
    }

    // Delete bill (cascade deletes bill_items)
    await supabase.from('bills').delete().eq('id', billId);
  } else {
    // Memory fallback
    const bill = fallbackBills.find(b => b.id === billId);
    const itemsToRestore = items || (bill ? bill.items : []);
    for (const item of itemsToRestore) {
      if (item.product_id) {
        fallbackProducts = fallbackProducts.map(p => {
          if (p.id === item.product_id) {
            return { ...p, quantity: (p.quantity || 0) + (item.quantity || 0) };
          }
          return p;
        });
      }
    }
    fallbackBills = fallbackBills.filter(b => b.id !== billId);
  }

  return true;
}

// 3. REQUESTED ITEMS
export async function getRequestedItems() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('requested_items')
      .select('*')
      .order('requested_at', { ascending: false });
    if (!error && data) return data;
  }
  return [...fallbackRequested];
}

export async function addRequestedItem(name) {
  const item = {
    id: crypto.randomUUID(),
    name: name.trim(),
    requested_at: new Date().toISOString()
  };
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('requested_items').insert([item]).select().single();
    if (!error && data) return data;
  }
  fallbackRequested.unshift(item);
  return item;
}

// 4. SETTINGS
export async function getSettings() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
    if (!error && data) return data;
  }
  return { ...fallbackSettings };
}

export async function updateSettings(updates) {
  const updated = {
    ...fallbackSettings,
    ...updates,
    updated_at: new Date().toISOString()
  };
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('settings')
      .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (!error && data) return data;
  }
  fallbackSettings = updated;
  return updated;
}

// 5. STORAGE UPLOAD FOR DEMO VIDEOS
export async function uploadDemoVideo(file) {
  if (isSupabaseConfigured) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const filePath = `demos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('cracker-videos')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('cracker-videos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  // Fallback blob URL for testing
  return URL.createObjectURL(file);
}
