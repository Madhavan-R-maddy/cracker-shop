import React, { useState, useMemo, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { createBill } from '../lib/supabase';
import QrScannerModal from '../components/QrScannerModal';
import CustomerAskedModal from '../components/CustomerAskedModal';

export default function Billing({ 
  products = [], 
  bills = [], 
  onBillCreated, 
  onOpenPrintModal,
  initialBill = null // When editing or copying
}) {
  // Bill Meta
  const [customerName, setCustomerName] = useState('');
  const [place, setPlace] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [billNumber, setBillNumber] = useState('');

  // Bill Items: [{ id, product_id, name, rate, qty, stock }]
  const [items, setItems] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Reference to latest products list to avoid stale closure lookups
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Search & input
  const [searchQuery, setSearchQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualRate, setManualRate] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [showManualAdd, setShowManualAdd] = useState(false);

  // Modals & Save states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCustomerAskedOpen, setIsCustomerAskedOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedBillData, setSavedBillData] = useState(null);

  // Generate clean automatic Bill Number starting fresh from INV-YYYY-0001
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    let maxNum = 0;
    (bills || []).forEach(b => {
      if (b.bill_number) {
        const match = b.bill_number.match(/INV-\d{4}-(\d+)/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      }
    });
    const nextNum = (maxNum + 1).toString().padStart(4, '0');
    setBillNumber(`INV-${currentYear}-${nextNum}`);
  }, [bills]);

  // Search Suggestions from live stock
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.trim().toLowerCase();
    return products
      .filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.category.toLowerCase().includes(query) ||
        (p.qr_code && p.qr_code.toLowerCase().includes(query))
      )
      .slice(0, 6);
  }, [products, searchQuery]);

  // ------------------------------------------------------------------
  // ITEM ADDITION HANDLERS
  // ------------------------------------------------------------------
  function addItemFromProduct(product, initialQty = 1) {
    setItems(prevItems => {
      const existingIdx = prevItems.findIndex(i => i.product_id === product.id);
      if (existingIdx !== -1) {
        // Increment quantity
        const updated = [...prevItems];
        updated[existingIdx].qty = (parseInt(updated[existingIdx].qty, 10) || 0) + initialQty;
        return updated;
      }
      return [
        ...prevItems,
        {
          id: crypto.randomUUID(),
          product_id: product.id,
          name: product.name,
          rate: parseFloat(product.price) || 0,
          qty: initialQty,
          unit: product.unit || 'box',
          stock: product.quantity
        }
      ];
    });
    setSearchQuery('');
  }

  function handleAddManual(e) {
    e.preventDefault();
    if (!manualName.trim() || !manualRate) return;

    setItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        product_id: null,
        name: manualName.trim(),
        rate: parseFloat(manualRate) || 0,
        qty: Math.max(1, parseInt(manualQty, 10) || 1),
        unit: 'box',
        stock: null
      }
    ]);

    setManualName('');
    setManualRate('');
    setManualQty(1);
    setShowManualAdd(false);
  }

  // Continuous QR Code scanner lookup & add handler
  function handleQrScan(decodedCode) {
    if (!decodedCode) return { success: false, code: '' };
    const rawTrimmed = decodedCode.trim();

    // Extract code if encoded as URL or query parameter
    let cleanCode = rawTrimmed;
    try {
      if (cleanCode.startsWith('http://') || cleanCode.startsWith('https://')) {
        const url = new URL(cleanCode);
        const param = url.searchParams.get('qr') || url.searchParams.get('code') || url.searchParams.get('c');
        if (param) {
          cleanCode = param.trim();
        } else {
          const parts = url.pathname.split('/').filter(Boolean);
          if (parts.length > 0) cleanCode = parts[parts.length - 1].trim();
        }
      }
    } catch {}

    const lower = cleanCode.toLowerCase();
    const currentProducts = productsRef.current || [];

    // Look up cracker by qr_code, id, or name (case-insensitive & whitespace-trimmed)
    const found = currentProducts.find(p => {
      const pQr = (p.qr_code || '').trim().toLowerCase();
      const pName = (p.name || '').trim().toLowerCase();
      const pId = (p.id || '').trim();

      return (
        (pQr && pQr === lower) ||
        (pQr && lower.includes(pQr)) ||
        (pQr && pQr.includes(lower)) ||
        pId === rawTrimmed ||
        pName === lower
      );
    });

    if (!found) {
      // If code does not match any cracker, do NOT add anything to the bill
      return { success: false, code: rawTrimmed };
    }

    let calculatedNewQty = 1;

    setItems(prevItems => {
      const existingIdx = prevItems.findIndex(i => i.product_id === found.id);
      if (existingIdx !== -1) {
        // Increment quantity and move to top of the list so newest scanned item is visible first
        const updated = [...prevItems];
        const currentQty = parseInt(updated[existingIdx].qty, 10) || 0;
        calculatedNewQty = currentQty + 1;
        const updatedItem = {
          ...updated[existingIdx],
          qty: calculatedNewQty,
          lastScannedAt: Date.now()
        };
        updated.splice(existingIdx, 1);
        return [updatedItem, ...updated];
      }

      // Add as new line item with quantity 1 (newest on top)
      calculatedNewQty = 1;
      return [
        {
          id: crypto.randomUUID(),
          product_id: found.id,
          name: found.name,
          rate: parseFloat(found.price) || 0,
          qty: 1,
          unit: found.unit || 'box',
          stock: found.quantity,
          lastScannedAt: Date.now()
        },
        ...prevItems
      ];
    });

    return { success: true, product: found, newQty: calculatedNewQty };
  }

  // Quantity updates
  function updateItemQty(index, delta) {
    setItems(prev => {
      const copy = [...prev];
      const newQty = (parseInt(copy[index].qty, 10) || 0) + delta;
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      copy[index].qty = newQty;
      return copy;
    });
  }

  function setDirectQty(index, value) {
    setItems(prev => {
      const copy = [...prev];
      copy[index].qty = Math.max(1, parseInt(value, 10) || 1);
      return copy;
    });
  }

  function setDirectRate(index, value) {
    setItems(prev => {
      const copy = [...prev];
      copy[index].rate = Math.max(0, parseFloat(value) || 0);
      return copy;
    });
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  // ------------------------------------------------------------------
  // TOTALS & DISCOUNT COMPUTATION
  // ------------------------------------------------------------------
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.rate * item.qty), 0);
  }, [items]);

  const discountAmount = useMemo(() => {
    const pct = Math.min(100, Math.max(0, parseFloat(discountPercent) || 0));
    return Math.round((subtotal * pct) / 100);
  }, [subtotal, discountPercent]);

  const finalTotal = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  // ------------------------------------------------------------------
  // SAVE BILL & UPDATE STOCK
  // ------------------------------------------------------------------
  async function handleSaveBill() {
    if (!customerName.trim()) {
      alert('Please enter Customer Name (Required)');
      document.getElementById('billing-customer-name')?.focus();
      return;
    }

    if (items.length === 0) {
      alert('Please add at least 1 cracker to the bill before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const billData = {
        bill_number: billNumber,
        customer_name: customerName.trim(),
        place: place.trim(),
        bill_date: new Date(billDate).toISOString(),
        subtotal,
        discount_percent: parseFloat(discountPercent) || 0,
        discount_amount: discountAmount,
        final_total: finalTotal
      };

      const saved = await createBill(billData, items);

      // Trigger festive celebration sound/confetti
      try {
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
      } catch {}

      setSavedBillData(saved);
      if (onBillCreated) onBillCreated(saved);
    } catch (err) {
      console.error(err);
      alert('Failed to save bill: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  // Reset to create another new bill
  function handleStartNewBill() {
    setCustomerName('');
    setPlace('');
    setItems([]);
    setDiscountPercent(0);
    setSavedBillData(null);
    const currentYear = new Date().getFullYear();
    let maxNum = 0;
    (bills || []).forEach(b => {
      if (b.bill_number) {
        const match = b.bill_number.match(/INV-\d{4}-(\d+)/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      }
    });
    // Add 1 to current max
    const nextNum = (maxNum + 1).toString().padStart(4, '0');
    setBillNumber(`INV-${currentYear}-${nextNum}`);
  }

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto w-full pb-8">
      {/* ------------------------------------------------------------- */}
      {/* CUSTOMER & BILL HEADER SECTION */}
      {/* ------------------------------------------------------------- */}
      <section className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-4 shadow-xs grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-4 flex flex-col gap-1">
          <label htmlFor="billing-customer-name" className="font-label text-xs font-bold text-light-on-surface">
            Customer Name <span className="text-bright-red">*</span>
          </label>
          <input
            id="billing-customer-name"
            type="text"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Enter customer name"
            disabled={Boolean(savedBillData)}
            className="min-h-11 px-3 py-2 rounded-md bg-light-surface-container-lowest border border-gold-border font-title text-sm text-light-on-surface focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        <div className="md:col-span-4 flex flex-col gap-1">
          <label htmlFor="billing-customer-place" className="font-label text-xs font-bold text-light-on-surface">
            Place / Town
          </label>
          <input
            id="billing-customer-place"
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. Salem, Trichy, Chennai..."
            disabled={Boolean(savedBillData)}
            className="min-h-11 px-3 py-2 rounded-md bg-light-surface-container-lowest border border-gold-border font-body text-sm text-light-on-surface focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        <div className="md:col-span-4 flex items-center justify-between gap-3 bg-light-surface-container-low border border-light-outline-variant rounded-md px-3 py-2 min-h-11">
          <div>
            <p className="font-label text-[10px] text-light-on-surface-variant font-bold">Bill No.</p>
            <p className="font-mono text-xs sm:text-sm font-bold text-deep-green tabular-nums">
              {savedBillData?.bill_number || billNumber}
            </p>
          </div>
          <div className="text-right">
            <p className="font-label text-[10px] text-light-on-surface-variant font-bold">Date</p>
            <input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              disabled={Boolean(savedBillData)}
              className="font-mono text-xs text-light-on-surface bg-transparent border-0 p-0 text-right focus:outline-none font-bold"
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 3 WAYS TO ADD CRACKERS (Fast search, Camera QR, Manual) */}
      {/* ------------------------------------------------------------- */}
      {!savedBillData && (
        <section className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-3.5 shadow-xs flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            {/* 1. Fast Search with Suggestions as you type */}
            <div className="relative flex-1 flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-deep-green text-[22px]">
                search
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type to search stock (e.g. Sparklers, 30 Shot, Flower Pots)..."
                className="w-full min-h-12 pl-10 pr-4 py-2 rounded-md bg-light-surface-container-lowest border border-gold-border text-sm font-body text-light-on-surface focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>

            {/* 2. Camera QR Scanner Button */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="inline-flex items-center justify-center gap-2 min-h-12 px-4 rounded-md bg-deep-green text-on-deep-green font-label text-xs sm:text-sm font-bold shadow-xs hover:opacity-95 active:scale-98"
            >
              <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
              <span>Scan QR</span>
            </button>

            {/* 3. Manual Type Button Toggle */}
            <button
              type="button"
              onClick={() => setShowManualAdd(!showManualAdd)}
              className="inline-flex items-center justify-center gap-1.5 min-h-12 px-3.5 rounded-md bg-gold-soft text-deep-green border border-gold-border font-label text-xs sm:text-sm font-bold hover:bg-gold hover:text-on-gold"
            >
              <span className="material-symbols-outlined text-[18px]">edit_note</span>
              <span>Manual Type</span>
            </button>
          </div>

          {/* Instant Search Suggestions Box */}
          {searchSuggestions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1 border-t border-light-outline-variant">
              {searchSuggestions.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => addItemFromProduct(prod, 1)}
                  className="flex items-center justify-between p-2.5 rounded-md bg-gold-soft border border-gold-border text-left hover:bg-gold hover:text-on-gold transition-colors active:scale-98 shadow-xs"
                >
                  <div className="truncate mr-2">
                    <p className="font-title text-xs font-bold text-light-on-surface truncate">
                      {prod.name}
                    </p>
                    <p className="font-body text-[11px] text-light-on-surface-variant">
                      Stock: <strong className="font-mono">{prod.quantity}</strong> {prod.unit}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-deep-green whitespace-nowrap">
                    + ₹{prod.price}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Manual Item Entry Bar */}
          {showManualAdd && (
            <form onSubmit={handleAddManual} className="bg-light-surface-container-low border border-light-outline-variant p-3 rounded-md grid grid-cols-1 sm:grid-cols-12 gap-2 items-end animate-in fade-in duration-150">
              <div className="sm:col-span-5 flex flex-col gap-1">
                <span className="font-label text-[11px] font-bold">Item Name:</span>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Special Crackers Box"
                  className="min-h-10 px-2.5 py-1 rounded border border-gold-border text-xs bg-white"
                />
              </div>
              <div className="sm:col-span-3 flex flex-col gap-1">
                <span className="font-label text-[11px] font-bold">Rate (₹):</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={manualRate}
                  onChange={(e) => setManualRate(e.target.value)}
                  placeholder="Rate"
                  className="min-h-10 px-2.5 py-1 rounded border border-gold-border font-mono text-xs text-right bg-white"
                />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-1">
                <span className="font-label text-[11px] font-bold">Qty:</span>
                <input
                  type="number"
                  min="1"
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                  className="min-h-10 px-2 py-1 rounded border border-gold-border font-mono text-xs text-center bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full min-h-10 rounded bg-deep-green text-white font-label text-xs font-bold hover:opacity-90"
                >
                  Add Item
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BILL ITEMS TABLE + SUMMARY PANEL */}
      {/* ------------------------------------------------------------- */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Items Table */}
        <div className="lg:col-span-8 bg-light-surface-container-lowest border border-gold-border rounded-lg overflow-hidden shadow-xs">
          <header className="px-4 py-2.5 bg-light-primary-container border-b border-gold-border flex items-center justify-between">
            <h2 className="font-headline text-sm md:text-base font-bold text-deep-green">
              Current Bill Items
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-gold text-on-gold font-label text-xs font-bold tabular-nums">
              {items.length} items
            </span>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-light-surface-container-low border-b border-light-outline-variant text-light-on-surface-variant text-[11px] font-label font-bold uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2.5 w-10">#</th>
                  <th scope="col" className="px-3 py-2.5">Item Name</th>
                  <th scope="col" className="px-3 py-2.5 text-right w-24">Rate (₹)</th>
                  <th scope="col" className="px-3 py-2.5 text-center w-36">Quantity</th>
                  <th scope="col" className="px-3 py-2.5 text-right w-28">Total (₹)</th>
                  {!savedBillData && (
                    <th scope="col" className="px-3 py-2.5 text-center w-12">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-light-outline-variant text-xs sm:text-sm">
                {items.length > 0 ? (
                  items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-gold-soft/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-light-on-surface-variant font-bold tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5 font-title font-bold text-light-on-surface">
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                          {item.stock !== null && (
                            <span className="text-[10px] font-mono text-light-on-surface-variant font-normal">
                              In Stock: {item.stock} {item.unit}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {!savedBillData ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) => setDirectRate(idx, e.target.value)}
                            className="w-20 px-1.5 py-1 rounded border border-gold-border font-mono text-right text-xs bg-white tabular-nums font-semibold"
                          />
                        ) : (
                          <span className="font-mono font-semibold">₹{item.rate}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {!savedBillData ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateItemQty(idx, -1)}
                              className="w-8 h-8 rounded bg-light-surface-container border border-gold-border font-label font-bold text-sm text-light-on-surface active:scale-95"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => setDirectQty(idx, e.target.value)}
                              className="w-14 h-8 text-center rounded border border-gold-border font-mono text-xs font-bold tabular-nums bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => updateItemQty(idx, 1)}
                              className="w-8 h-8 rounded bg-light-surface-container border border-gold-border font-label font-bold text-sm text-light-on-surface active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono font-bold text-sm">{item.qty}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-deep-green tabular-nums">
                        ₹{(item.rate * item.qty).toLocaleString('en-IN')}
                      </td>
                      {!savedBillData && (
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            aria-label={`Remove ${item.name}`}
                            className="w-8 h-8 rounded text-bright-red hover:bg-red-soft inline-flex items-center justify-center transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-light-on-surface-variant">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-gold text-[36px]">add_shopping_cart</span>
                        <p className="font-title text-sm font-bold">No crackers added to bill yet</p>
                        <p className="font-body text-xs">Search above, scan a cracker QR, or tap manual entry.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bill Summary & Save / Print Card */}
        <aside className="lg:col-span-4 bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-4">
          <h2 className="font-headline text-base font-bold text-light-on-surface">
            Bill Summary
          </h2>

          <div className="flex items-center justify-between gap-2">
            <label htmlFor="billing-discount-pct" className="font-label text-xs font-bold text-light-on-surface">
              Discount (%)
            </label>
            <input
              id="billing-discount-pct"
              type="number"
              min="0"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              disabled={Boolean(savedBillData)}
              className="w-24 min-h-10 px-3 py-1.5 rounded-md border border-gold-border font-mono text-sm font-bold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>

          <div className="border-t border-light-outline-variant pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-light-on-surface-variant font-body">Subtotal</span>
              <span className="font-mono font-bold tabular-nums">
                ₹{subtotal.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-light-on-surface-variant font-body">
                Discount ({discountPercent || 0}%)
              </span>
              <span className="font-mono font-bold text-bright-red tabular-nums">
                - ₹{discountAmount.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="border-t-2 border-gold-border pt-2 flex items-center justify-between">
              <span className="font-headline text-base font-bold text-deep-green">
                FINAL BILL
              </span>
              <span className="font-headline text-2xl font-bold text-deep-green tabular-nums">
                ₹{finalTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          {!savedBillData ? (
            <button
              type="button"
              onClick={handleSaveBill}
              disabled={isSaving || items.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 min-h-13 px-5 py-3 rounded-lg bg-deep-green text-on-deep-green font-label text-sm font-bold shadow-md hover:opacity-90 active:scale-98 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">save</span>
              <span>{isSaving ? 'Saving Bill & Updating Stock...' : 'Save Bill'}</span>
            </button>
          ) : (
            <div className="flex flex-col gap-2.5">
              {/* SUCCESS NOTICE */}
              <div className="p-3 rounded-md bg-light-primary-container text-deep-green text-xs font-label font-bold flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                <span>Bill Saved! Stock updated automatically.</span>
              </div>

              {/* PRINT BUTTON: Opens 2 Options Only (A4 and 58mm Thermal) */}
              <button
                type="button"
                onClick={() => onOpenPrintModal(savedBillData)}
                className="w-full inline-flex items-center justify-center gap-2 min-h-13 px-5 py-3 rounded-lg bg-bright-red text-white font-label text-sm font-bold shadow-md hover:opacity-90 active:scale-98 transition-all"
              >
                <span className="material-symbols-outlined text-[22px]">print</span>
                <span>Print Bill</span>
              </button>

              <button
                type="button"
                onClick={handleStartNewBill}
                className="w-full min-h-11 px-4 rounded-md border border-gold-border bg-white font-label text-xs font-bold text-deep-green hover:bg-gold-soft"
              >
                + Create Next Bill
              </button>
            </div>
          )}
        </aside>
      </section>

      {/* Camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleQrScan}
        products={products}
        items={items}
      />

      {/* Customer Asked For Modal */}
      <CustomerAskedModal
        isOpen={isCustomerAskedOpen}
        onClose={() => setIsCustomerAskedOpen(false)}
      />
    </div>
  );
}
