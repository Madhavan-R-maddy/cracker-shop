import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { hashPin } from '../lib/crypto';
import { 
  getSettings, 
  updateSettings, 
  addProduct, 
  isSupabaseConfigured,
  supabase
} from '../lib/supabase';

export default function Settings({ 
  settings = {}, 
  products = [], 
  bills = [], 
  requestedItems = [], 
  onRefresh,
  onOpenSetupInstructions 
}) {
  // Investment
  const [investment, setInvestment] = useState(settings?.total_investment || 150000);
  const [savingInvestment, setSavingInvestment] = useState(false);
  const [investmentSuccess, setInvestmentSuccess] = useState(false);

  // Change PIN
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  // Backup state
  const [importLoading, setImportLoading] = useState(false);

  // ------------------------------------------------------------------
  // SAVE TOTAL INVESTMENT
  // ------------------------------------------------------------------
  async function handleSaveInvestment(e) {
    e.preventDefault();
    setSavingInvestment(true);
    try {
      await updateSettings({ total_investment: parseFloat(investment) || 0 });
      setInvestmentSuccess(true);
      setTimeout(() => setInvestmentSuccess(false), 2000);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Failed to save investment: ' + err.message);
    } finally {
      setSavingInvestment(false);
    }
  }

  // ------------------------------------------------------------------
  // CHANGE PIN
  // ------------------------------------------------------------------
  async function handleChangePin(e) {
    e.preventDefault();
    setPinError('');
    setPinSuccess(false);

    if (newPin.length < 4) {
      setPinError('New PIN must be at least 4 digits.');
      return;
    }

    if (newPin !== confirmPin) {
      setPinError('New PIN and Confirm PIN do not match.');
      return;
    }

    setSavingPin(true);
    try {
      // Verify old PIN
      const currentHashed = await hashPin(oldPin);
      const currentSettings = await getSettings();
      const storedHash = currentSettings?.pin_hash || '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

      if (currentHashed !== storedHash) {
        setPinError('Current PIN is incorrect.');
        setSavingPin(false);
        return;
      }

      // Hash and save new PIN
      const newHash = await hashPin(newPin);
      await updateSettings({ pin_hash: newHash });

      setPinSuccess(true);
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      if (onRefresh) onRefresh();
    } catch (err) {
      setPinError('Failed to change PIN: ' + err.message);
    } finally {
      setSavingPin(false);
    }
  }

  // ------------------------------------------------------------------
  // BACKUP EXPORT (JSON & EXCEL)
  // ------------------------------------------------------------------
  function handleExportJson() {
    const backupData = {
      timestamp: new Date().toISOString(),
      shop: 'Sri Senthur Pattasu Kadai',
      products,
      bills,
      requestedItems,
      settings
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pattasu-kadai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportExcel() {
    const wb = XLSX.utils.book_new();

    // 1. Products Sheet
    const productRows = products.map(p => ({
      'ID': p.id,
      'Name': p.name,
      'Category': p.category,
      'Price': p.price,
      'Quantity': p.quantity,
      'Unit': p.unit,
      'Reorder Level': p.low_stock_level,
      'QR Code': p.qr_code,
      'Video URL': p.video_url || ''
    }));
    const wsProducts = XLSX.utils.json_to_sheet(productRows);
    XLSX.utils.book_append_sheet(wb, wsProducts, 'Products');

    // 2. Bills Sheet
    const billRows = bills.map(b => ({
      'Bill No': b.bill_number,
      'Date': b.bill_date,
      'Customer': b.customer_name,
      'Place': b.place,
      'Subtotal': b.subtotal,
      'Discount %': b.discount_percent,
      'Discount Amt': b.discount_amount,
      'Final Total': b.final_total
    }));
    const wsBills = XLSX.utils.json_to_sheet(billRows);
    XLSX.utils.book_append_sheet(wb, wsBills, 'Bills');

    // 3. Requested Items Sheet
    const reqRows = requestedItems.map(r => ({
      'Item Name': r.name,
      'Requested At': r.requested_at
    }));
    const wsReq = XLSX.utils.json_to_sheet(reqRows);
    XLSX.utils.book_append_sheet(wb, wsReq, 'Requested Items');

    // Save
    XLSX.writeFile(wb, `pattasu-kadai-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ------------------------------------------------------------------
  // BACKUP IMPORT (RESTORE)
  // ------------------------------------------------------------------
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('Importing data will add products from the backup file into your database. Continue?')) {
      return;
    }

    setImportLoading(true);
    try {
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.products && Array.isArray(data.products)) {
          for (const p of data.products) {
            await addProduct(p);
          }
          alert(`Successfully imported ${data.products.length} products from JSON backup!`);
        }
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets['Products'] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        for (const row of rows) {
          if (row.Name || row['Cracker Name']) {
            await addProduct({
              name: row.Name || row['Cracker Name'],
              category: row.Category || 'General',
              price: row.Price || 0,
              quantity: row.Quantity || 0,
              unit: row.Unit || 'box',
              low_stock_level: row['Reorder Level'] || 10,
              qr_code: row['QR Code'] || `CRK-${Date.now().toString(36).toUpperCase()}`
            });
          }
        }
        alert(`Imported products from Excel backup!`);
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-8">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-light-on-surface">
            Settings & Terminal Config
          </h1>
          <p className="font-body text-xs md:text-sm text-light-on-surface-variant">
            Manage investment, PIN security, cloud database setup and data backup copies
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSetupInstructions}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-deep-green text-white font-label text-xs font-bold hover:opacity-90 shadow-xs"
        >
          <span className="material-symbols-outlined text-[18px]">help</span>
          <span>Supabase & Vercel Setup</span>
        </button>
      </div>

      {/* Cloud Connection Status Banner */}
      <div className={`p-4 rounded-lg border-2 flex items-center justify-between gap-3 shadow-xs ${
        isSupabaseConfigured 
          ? 'bg-light-primary-container border-deep-green/40 text-deep-green' 
          : 'bg-gold-soft border-gold-border text-on-gold'
      }`}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[24px]">
            {isSupabaseConfigured ? 'cloud_done' : 'cloud_sync'}
          </span>
          <div>
            <p className="font-title text-sm font-bold">
              {isSupabaseConfigured ? 'Supabase Postgres & Storage Connected' : 'Running in Local / Standalone Mode'}
            </p>
            <p className="font-body text-xs opacity-90">
              {isSupabaseConfigured 
                ? 'All business data is stored in Supabase tables and synced across mobile and desktop.'
                : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env to connect your live Supabase cloud database.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSetupInstructions}
          className="px-3 py-1.5 rounded bg-white border border-current font-label text-xs font-bold whitespace-nowrap hover:bg-white/80"
        >
          View Guide
        </button>
      </div>

      {/* 1. Total Investment Configuration */}
      <section className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-light-outline-variant pb-2.5">
          <span className="material-symbols-outlined text-gold text-[22px]">account_balance</span>
          <h2 className="font-headline text-base font-bold text-light-on-surface">
            Total Investment Amount
          </h2>
        </div>

        <p className="font-body text-xs text-light-on-surface-variant">
          Enter the total investment made for purchasing cracker stock this season. This is used in the Analytics screen to compute your exact net profit (Total Sales minus Total Investment).
        </p>

        <form onSubmit={handleSaveInvestment} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 font-mono text-sm font-bold text-deep-green">₹</span>
            <input
              type="number"
              min="0"
              step="100"
              required
              value={investment}
              onChange={(e) => setInvestment(e.target.value)}
              className="w-full min-h-11 pl-8 pr-3 py-2 rounded-md border border-gold-border font-mono text-base font-bold text-deep-green tabular-nums"
            />
          </div>

          <button
            type="submit"
            disabled={savingInvestment}
            className="min-h-11 px-5 rounded-md bg-gold text-on-gold border border-gold-border font-label text-xs font-bold hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {savingInvestment ? 'Saving...' : 'Update Investment'}
          </button>
        </form>

        {investmentSuccess && (
          <p className="font-label text-xs text-success flex items-center gap-1 font-bold">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            Investment amount saved in Supabase!
          </p>
        )}
      </section>

      {/* 2. Change PIN Screen */}
      <section className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-light-outline-variant pb-2.5">
          <span className="material-symbols-outlined text-gold text-[22px]">lock_reset</span>
          <h2 className="font-headline text-base font-bold text-light-on-surface">
            Change Shared Owner PIN
          </h2>
        </div>

        <p className="font-body text-xs text-light-on-surface-variant">
          Access to this terminal is protected by a shared owner PIN (default: <strong>1234</strong>). The PIN is hashed with SHA-256 in Supabase.
        </p>

        <form onSubmit={handleChangePin} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <label className="flex flex-col gap-1">
            <span className="font-label text-xs font-semibold">Current PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              value={oldPin}
              onChange={(e) => setOldPin(e.target.value)}
              placeholder="••••"
              className="min-h-10 px-3 py-1.5 rounded-md border border-gold-border font-mono text-center text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label text-xs font-semibold">New PIN (4-6 digits)</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="••••"
              className="min-h-10 px-3 py-1.5 rounded-md border border-gold-border font-mono text-center text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label text-xs font-semibold">Confirm New PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="••••"
              className="min-h-10 px-3 py-1.5 rounded-md border border-gold-border font-mono text-center text-sm"
            />
          </label>

          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={savingPin || !oldPin || !newPin || !confirmPin}
              className="min-h-11 px-5 rounded-md bg-deep-green text-white font-label text-xs font-bold hover:opacity-90 disabled:opacity-50"
            >
              {savingPin ? 'Updating PIN...' : 'Save New PIN'}
            </button>
          </div>
        </form>

        {pinError && (
          <p className="font-label text-xs text-bright-red font-bold bg-red-soft p-2 rounded">
            {pinError}
          </p>
        )}

        {pinSuccess && (
          <p className="font-label text-xs text-success font-bold bg-light-primary-container p-2 rounded flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            Owner PIN successfully changed! Use your new PIN for future terminal unlock.
          </p>
        )}
      </section>

      {/* 3. Extra Safety Backup: Export & Import (JSON & Excel) */}
      <section className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-light-outline-variant pb-2.5">
          <span className="material-symbols-outlined text-gold text-[22px]">backup</span>
          <h2 className="font-headline text-base font-bold text-light-on-surface">
            Extra Safety Backup & Restore (JSON & Excel)
          </h2>
        </div>

        <p className="font-body text-xs text-light-on-surface-variant">
          Keep offline safety copies of your products catalog, stock counts, bills history and customer requests. You can export to JSON or Excel spreadsheet, and re-import anytime.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExportJson}
            className="p-3.5 rounded-lg border border-gold-border bg-light-surface-container-low hover:bg-gold-soft flex items-center gap-3 text-left transition-colors"
          >
            <span className="w-10 h-10 rounded-md bg-deep-green text-white inline-flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">download</span>
            </span>
            <div>
              <p className="font-title text-xs font-bold">Export JSON</p>
              <p className="font-body text-[11px] text-light-on-surface-variant">Full database dump</p>
            </div>
          </button>

          {/* Export Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="p-3.5 rounded-lg border border-gold-border bg-light-surface-container-low hover:bg-gold-soft flex items-center gap-3 text-left transition-colors"
          >
            <span className="w-10 h-10 rounded-md bg-success text-white inline-flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">table_view</span>
            </span>
            <div>
              <p className="font-title text-xs font-bold">Export Excel (.xlsx)</p>
              <p className="font-body text-[11px] text-light-on-surface-variant">Multi-sheet workbook</p>
            </div>
          </button>

          {/* Import Backup */}
          <label className="p-3.5 rounded-lg border border-gold-border bg-light-surface-container-low hover:bg-gold-soft flex items-center gap-3 text-left transition-colors cursor-pointer">
            <span className="w-10 h-10 rounded-md bg-peacock-blue text-white inline-flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">upload</span>
            </span>
            <div>
              <p className="font-title text-xs font-bold">{importLoading ? 'Importing...' : 'Import Backup'}</p>
              <p className="font-body text-[11px] text-light-on-surface-variant">Restore JSON / Excel</p>
            </div>
            <input
              type="file"
              accept=".json, .xlsx, .xls"
              onChange={handleImportFile}
              disabled={importLoading}
              className="hidden"
            />
          </label>
        </div>
      </section>
    </div>
  );
}
