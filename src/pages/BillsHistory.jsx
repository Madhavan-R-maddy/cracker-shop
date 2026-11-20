import React, { useState, useMemo } from 'react';
import { deleteBill, updateBill } from '../lib/supabase';

export default function BillsHistory({ 
  bills = [], 
  products = [], 
  onRefresh, 
  onOpenPrintModal 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [editingBill, setEditingBill] = useState(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [editItems, setEditItems] = useState([]);
  const [editDiscountPercent, setEditDiscountPercent] = useState(0);

  // Filter bills
  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      const matchSearch = (
        (b.customer_name && b.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (b.place && b.place.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (b.bill_number && b.bill_number.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      const matchDate = !dateFilter || b.bill_date?.startsWith(dateFilter);
      return matchSearch && matchDate;
    });
  }, [bills, searchTerm, dateFilter]);

  // Overall totals
  const totalRevenue = useMemo(() => {
    return filteredBills.reduce((acc, b) => acc + (parseFloat(b.final_total) || 0), 0);
  }, [filteredBills]);

  // Handle Delete with Stock Restoration
  async function handleDelete(bill) {
    const confirmMsg = `Are you sure you want to delete bill "${bill.bill_number}" for ${bill.customer_name}? \n\nThis will permanently delete the bill and return all billed cracker quantities back into stock!`;
    if (window.confirm(confirmMsg)) {
      try {
        await deleteBill(bill.id, bill.items);
        alert(`Bill ${bill.bill_number} deleted. Stock quantities restored!`);
        if (onRefresh) onRefresh();
      } catch (err) {
        alert('Failed to delete bill: ' + err.message);
      }
    }
  }

  // Open Edit Modal
  function handleOpenEdit(bill) {
    setEditingBill(bill);
    setEditCustomerName(bill.customer_name);
    setEditPlace(bill.place || '');
    setEditItems(JSON.parse(JSON.stringify(bill.items || [])));
    setEditDiscountPercent(bill.discount_percent || 0);
  }

  // Update item quantity in edit modal
  function handleEditQty(idx, delta) {
    setEditItems(prev => {
      const copy = [...prev];
      const newQty = (parseInt(copy[idx].quantity, 10) || 0) + delta;
      if (newQty <= 0) return copy.filter((_, i) => i !== idx);
      copy[idx].quantity = newQty;
      copy[idx].total = copy[idx].rate * newQty;
      return copy;
    });
  }

  // Compute edit totals
  const editSubtotal = useMemo(() => {
    return editItems.reduce((acc, item) => acc + (item.rate * item.quantity), 0);
  }, [editItems]);

  const editDiscountAmount = useMemo(() => {
    const pct = Math.min(100, Math.max(0, parseFloat(editDiscountPercent) || 0));
    return Math.round((editSubtotal * pct) / 100);
  }, [editSubtotal, editDiscountPercent]);

  const editFinalTotal = useMemo(() => {
    return Math.max(0, editSubtotal - editDiscountAmount);
  }, [editSubtotal, editDiscountAmount]);

  // Save Edit with Stock Delta adjustment
  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editCustomerName.trim() || editItems.length === 0) return;

    try {
      await updateBill(
        editingBill.id,
        {
          customer_name: editCustomerName.trim(),
          place: editPlace.trim(),
          bill_date: editingBill.bill_date,
          subtotal: editSubtotal,
          discount_percent: parseFloat(editDiscountPercent) || 0,
          discount_amount: editDiscountAmount,
          final_total: editFinalTotal
        },
        editItems,
        editingBill.items
      );

      alert(`Bill ${editingBill.bill_number} updated. Stock adjusted accordingly!`);
      setEditingBill(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Error updating bill: ' + err.message);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto w-full">
      {/* Page Title & KPI Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-light-on-surface">
            Bills History
          </h1>
          <p className="font-body text-xs md:text-sm text-light-on-surface-variant">
            View, re-print, edit or delete past counter bills (Stock updates automatically)
          </p>
        </div>

        <div className="flex items-center gap-3 bg-light-surface-container-lowest border border-gold-border rounded-lg px-4 py-2 shadow-xs">
          <div>
            <p className="font-label text-[10px] text-light-on-surface-variant font-bold">Total Bills</p>
            <p className="font-mono text-base font-bold text-deep-green tabular-nums">
              {filteredBills.length}
            </p>
          </div>
          <div className="w-px h-8 bg-light-outline-variant" />
          <div>
            <p className="font-label text-[10px] text-light-on-surface-variant font-bold">Total Sales</p>
            <p className="font-mono text-base font-bold text-deep-green tabular-nums">
              ₹{totalRevenue.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-3 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-deep-green text-[20px]">
            search
          </span>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by customer name, place, or bill number..."
            className="w-full min-h-11 pl-10 pr-4 py-2 rounded-md bg-light-surface-container-lowest border border-gold-border text-xs sm:text-sm font-body text-light-on-surface focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="bills-date-filter" className="font-label text-xs font-bold text-light-on-surface whitespace-nowrap">
            Date:
          </label>
          <input
            id="bills-date-filter"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="min-h-11 px-3 py-2 rounded-md border border-gold-border bg-white font-mono text-xs text-light-on-surface"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs text-bright-red underline font-label font-bold"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-light-surface-container-lowest border border-gold-border rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-light-primary-container text-deep-green border-b border-gold-border text-xs font-label font-bold uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-4 py-3">Bill No.</th>
                <th scope="col" className="px-3 py-3">Date & Time</th>
                <th scope="col" className="px-4 py-3">Customer Name</th>
                <th scope="col" className="px-3 py-3">Place</th>
                <th scope="col" className="px-3 py-3 text-center">Items</th>
                <th scope="col" className="px-4 py-3 text-right">Final Bill (₹)</th>
                <th scope="col" className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-light-outline-variant text-xs sm:text-sm">
              {filteredBills.length > 0 ? (
                filteredBills.map((bill) => {
                  const dateStr = new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }).format(new Date(bill.bill_date));

                  return (
                    <tr key={bill.id} className="hover:bg-gold-soft/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-deep-green">
                        {bill.bill_number}
                      </td>
                      <td className="px-3 py-3 font-body text-light-on-surface-variant">
                        {dateStr}
                      </td>
                      <td className="px-4 py-3 font-title font-bold text-light-on-surface">
                        {bill.customer_name}
                      </td>
                      <td className="px-3 py-3 font-body text-light-on-surface-variant">
                        {bill.place || '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-light-surface-container font-mono text-xs font-semibold">
                          {(bill.items || []).length} items
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-sm text-deep-green tabular-nums">
                        ₹{parseFloat(bill.final_total).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Print Button */}
                          <button
                            type="button"
                            onClick={() => onOpenPrintModal(bill)}
                            className="px-2.5 py-1 rounded bg-gold text-on-gold font-label text-xs font-bold hover:opacity-90 inline-flex items-center gap-1 shadow-xs"
                            title="Print A4 or 58mm Thermal"
                          >
                            <span className="material-symbols-outlined text-[16px]">print</span>
                            <span>Print</span>
                          </button>

                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(bill)}
                            className="px-2.5 py-1 rounded bg-gold-soft text-deep-green border border-gold-border font-label text-xs font-bold hover:bg-gold hover:text-on-gold transition-colors"
                            title="Edit Bill"
                          >
                            Edit
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDelete(bill)}
                            className="w-8 h-8 rounded text-bright-red hover:bg-red-soft inline-flex items-center justify-center transition-colors"
                            title="Delete Bill (Restores Stock)"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-light-on-surface-variant">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-gold text-[40px]">receipt_long</span>
                      <p className="font-title text-sm font-bold">No bills found</p>
                      <p className="font-body text-xs">Try adjusting your search criteria or date filter.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* EDIT BILL MODAL */}
      {/* ------------------------------------------------------------- */}
      {editingBill && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-light-surface-container-lowest border-2 border-gold-border rounded-lg shadow-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-light-outline-variant pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-gold text-[22px]">edit_note</span>
                <h3 className="font-headline text-base font-bold text-light-on-surface">
                  Edit Bill: {editingBill.bill_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingBill(null)}
                className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">Customer Name *</span>
                  <input
                    type="text"
                    required
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                    className="min-h-10 px-3 py-1.5 rounded border border-gold-border font-title text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">Place</span>
                  <input
                    type="text"
                    value={editPlace}
                    onChange={(e) => setEditPlace(e.target.value)}
                    className="min-h-10 px-3 py-1.5 rounded border border-gold-border font-body text-xs"
                  />
                </label>
              </div>

              {/* Items List in Modal */}
              <div className="border border-gold-border rounded-md overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-light-primary-container text-deep-green font-label font-bold">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-2 py-2 text-right">Rate</th>
                      <th className="px-2 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light-outline-variant">
                    {editItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-title font-semibold">{item.product_name || item.name}</td>
                        <td className="px-2 py-2 text-right font-mono">₹{item.rate}</td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditQty(idx, -1)}
                              className="w-6 h-6 rounded bg-light-surface-container font-bold"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-mono font-bold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleEditQty(idx, 1)}
                              className="w-6 h-6 rounded bg-light-surface-container font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-deep-green">
                          ₹{item.rate * item.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Block in Modal */}
              <div className="bg-light-surface-container-low p-3 rounded-md flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono font-bold">₹{editSubtotal}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Discount (%):</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editDiscountPercent}
                    onChange={(e) => setEditDiscountPercent(e.target.value)}
                    className="w-16 px-2 py-1 rounded border border-gold-border font-mono text-right text-xs"
                  />
                </div>
                <div className="border-t border-gold-border pt-1 flex justify-between font-bold text-deep-green text-sm">
                  <span>FINAL BILL:</span>
                  <span>₹{editFinalTotal}</span>
                </div>
              </div>

              <p className="text-[11px] text-light-on-surface-variant italic">
                * Note: Stock quantities will be automatically synchronized based on differences between old and new item counts.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-light-outline-variant">
                <button
                  type="button"
                  onClick={() => setEditingBill(null)}
                  className="px-4 py-2 rounded-md border border-gold-border font-label text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-md bg-gold text-on-gold border border-gold-border font-label text-xs font-bold hover:opacity-90"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
