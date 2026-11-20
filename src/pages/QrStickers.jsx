import React, { useState, useMemo } from 'react';
import { generateQrSvgUri } from '../lib/qrcode';

export default function QrStickers({ products = [] }) {
  const [selectedIds, setSelectedIds] = useState(() => products.map(p => p.id));
  const [customQuantities, setCustomQuantities] = useState({});
  const [chunkPage, setChunkPage] = useState(1);
  const CHUNK_SIZE = 120; // 120 stickers per batch for ultra-smooth rendering

  // Toggle selection
  function toggleSelect(id) {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setChunkPage(1);
  }

  function handleSelectAll() {
    setSelectedIds(products.map(p => p.id));
    setChunkPage(1);
  }

  function handleDeselectAll() {
    setSelectedIds([]);
    setChunkPage(1);
  }

  function setQuantityOverride(id, qty) {
    setCustomQuantities(prev => ({
      ...prev,
      [id]: Math.max(0, parseInt(qty, 10) || 0)
    }));
    setChunkPage(1);
  }

  // Generate flat list of stickers (one per unit in stock or override)
  const allStickers = useMemo(() => {
    const list = [];
    products.forEach(p => {
      if (!selectedIds.includes(p.id)) return;
      
      const count = customQuantities[p.id] !== undefined 
        ? customQuantities[p.id] 
        : Math.max(0, parseInt(p.quantity, 10) || 0);

      for (let i = 0; i < count; i++) {
        list.push({
          id: `${p.id}-${i}`,
          productName: p.name,
          category: p.category,
          price: p.price,
          unit: p.unit,
          qrCode: p.qr_code,
          index: i + 1,
          totalForProduct: count
        });
      }
    });
    return list;
  }, [products, selectedIds, customQuantities]);

  const totalPages = Math.ceil(allStickers.length / CHUNK_SIZE) || 1;
  const displayedStickers = useMemo(() => {
    const start = (chunkPage - 1) * CHUNK_SIZE;
    return allStickers.slice(start, start + CHUNK_SIZE);
  }, [allStickers, chunkPage]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full print:m-0 print:p-0 print:w-full print:max-w-none print:gap-0">
      {/* Action Header (Hidden in Print) */}
      <div className="no-print flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-light-on-surface">
            QR Sticker Printing
          </h1>
          <p className="font-body text-xs md:text-sm text-light-on-surface-variant">
            Generate 1 barcode sticker per stocked unit. Cracker name is printed clearly beside each QR.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            disabled={allStickers.length === 0}
            className="inline-flex items-center gap-2 min-h-12 px-5 rounded-md bg-bright-red text-white font-label text-sm font-bold shadow-md hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">print</span>
            <span>Print {allStickers.length} Stickers</span>
          </button>
        </div>
      </div>

      {/* Item Selection & Quantity Customization Box (Hidden in Print) */}
      <div className="no-print bg-light-surface-container-lowest border border-gold-border rounded-lg p-4 shadow-xs flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-light-outline-variant pb-3">
          <div className="flex items-center gap-2">
            <span className="font-title text-sm font-bold text-light-on-surface">
              Select Crackers to Print
            </span>
            <span className="px-2 py-0.5 rounded-full bg-gold-soft text-deep-green font-mono text-xs font-bold">
              {selectedIds.length} of {products.length} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-3 py-1.5 rounded bg-light-surface-container-low border border-light-outline-variant font-label text-xs font-semibold hover:bg-gold-soft text-light-on-surface"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="px-3 py-1.5 rounded bg-light-surface-container-low border border-light-outline-variant font-label text-xs font-semibold hover:bg-red-soft text-bright-red"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Chips list of crackers with stock count */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto p-1">
          {products.map(p => {
            const isSelected = selectedIds.includes(p.id);
            const currentQty = customQuantities[p.id] !== undefined ? customQuantities[p.id] : p.quantity;

            return (
              <div
                key={p.id}
                className={`flex items-center justify-between p-2.5 rounded-md border text-xs transition-colors ${
                  isSelected 
                    ? 'border-gold-border bg-gold-soft/50 text-light-on-surface' 
                    : 'border-light-outline-variant bg-light-surface-container-low opacity-60'
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer flex-1 truncate mr-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(p.id)}
                    className="rounded text-gold focus:ring-gold"
                  />
                  <span className="font-title font-semibold truncate" title={p.name}>
                    {p.name}
                  </span>
                </label>

                {isSelected && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-light-on-surface-variant font-label">Qty:</span>
                    <input
                      type="number"
                      min="0"
                      value={currentQty}
                      onChange={(e) => setQuantityOverride(p.id, e.target.value)}
                      className="w-14 px-1.5 py-0.5 rounded border border-gold-border bg-white font-mono text-xs text-right tabular-nums font-bold"
                      title="Adjust stickers count for this batch"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination controls for large count batches */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-light-outline-variant text-xs">
            <span className="font-body text-light-on-surface-variant">
              Showing batch {chunkPage} of {totalPages} ({displayedStickers.length} of {allStickers.length} stickers)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={chunkPage === 1}
                onClick={() => setChunkPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-light-outline-variant bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 font-mono font-bold">{chunkPage} / {totalPages}</span>
              <button
                type="button"
                disabled={chunkPage === totalPages}
                onClick={() => setChunkPage(p => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-light-outline-variant bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Printable Sheet Area */}
      <div className="bg-white border-2 border-gold-border rounded-lg p-6 shadow-md print:border-none print:p-0 print:m-0 print:shadow-none print:w-full">
        {allStickers.length === 0 ? (
          <div className="py-16 text-center text-light-on-surface-variant flex flex-col items-center gap-2 no-print">
            <span className="material-symbols-outlined text-[48px] text-gold">qr_code_2</span>
            <p className="font-title text-base">No crackers selected or all quantities are 0</p>
            <p className="font-body text-xs">Select items from the list above to generate sticker sheets.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3 print:grid-cols-4 print:gap-1.5 print:w-full">
            {displayedStickers.map((sticker) => (
              <div
                key={sticker.id}
                className="border-2 border-black rounded-md p-2 flex items-center gap-2 bg-white text-black break-inside-avoid print:break-inside-avoid print:border-black print:p-1.5"
                style={{ minHeight: '74px' }}
              >
                {/* QR Code Square */}
                <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 bg-white flex items-center justify-center p-0.5 border border-black/20 print:border-black">
                  <img
                    src={generateQrSvgUri(sticker.qrCode, 100)}
                    alt={sticker.qrCode}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>

                {/* Cracker Name ONLY - High visibility, bold and readable */}
                <div className="flex flex-col justify-center flex-1 min-w-0 pl-1 leading-tight">
                  <p className="font-title text-xs sm:text-sm font-black text-black uppercase tracking-tight break-words line-clamp-3">
                    {sticker.productName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
