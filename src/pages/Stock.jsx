import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { 
  addProduct, 
  updateProduct, 
  deleteProduct, 
  deleteProducts, 
  deleteAllProducts, 
  supabase, 
  isSupabaseConfigured 
} from '../lib/supabase';
import VideoModal from '../components/VideoModal';

export default function Stock({ products = [], onRefresh, setActivePage }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedVideoCracker, setSelectedVideoCracker] = useState(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Bulk Selection & Delete states
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const [bulkDeleteSuccess, setBulkDeleteSuccess] = useState('');

  // Upload & Review state
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [reviewItems, setReviewItems] = useState([]);
  const [duplicateAction, setDuplicateAction] = useState('add'); // 'add' or 'skip'

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return ['ALL', ...Array.from(set)];
  }, [products]);

  // Filtered products (respecting search term and category)
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = (
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.qr_code && p.qr_code.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      const matchCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  // ----------------------------------------------------
  // SELECTION HELPERS
  // ----------------------------------------------------
  const isAllSelected = useMemo(() => {
    if (filteredProducts.length === 0) return false;
    return filteredProducts.every(p => selectedIds.includes(p.id));
  }, [filteredProducts, selectedIds]);

  const isSomeSelected = useMemo(() => {
    return filteredProducts.some(p => selectedIds.includes(p.id));
  }, [filteredProducts, selectedIds]);

  function handleToggleSelect(id) {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handleToggleSelectAll() {
    if (isAllSelected) {
      // Deselect all items currently shown in filtered view
      const currentFilteredIds = new Set(filteredProducts.map(p => p.id));
      setSelectedIds(prev => prev.filter(id => !currentFilteredIds.has(id)));
    } else {
      // Select all items currently shown in filtered view
      const combined = new Set([...selectedIds, ...filteredProducts.map(p => p.id)]);
      setSelectedIds(Array.from(combined));
    }
  }

  function handleClearSelection() {
    setSelectedIds([]);
  }

  // ----------------------------------------------------
  // BULK DELETE SELECTED CRACKERS
  // ----------------------------------------------------
  async function handleConfirmDeleteSelected() {
    if (selectedIds.length === 0) return;
    setIsBulkDeleting(true);
    setBulkDeleteError('');
    try {
      await deleteProducts(selectedIds);
      const count = selectedIds.length;
      setSelectedIds([]);
      setIsDeleteSelectedModalOpen(false);
      setBulkDeleteSuccess(`Successfully deleted ${count} ${count === 1 ? 'cracker' : 'crackers'} from stock.`);
      setTimeout(() => setBulkDeleteSuccess(''), 4000);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Delete selected error:', err);
      setBulkDeleteError(err.message || 'Failed to delete selected crackers.');
    } finally {
      setIsBulkDeleting(false);
    }
  }

  // ----------------------------------------------------
  // BULK DELETE ALL STOCK
  // ----------------------------------------------------
  async function handleConfirmDeleteAll() {
    if (deleteAllConfirmText.trim() !== 'DELETE') return;
    setIsBulkDeleting(true);
    setBulkDeleteError('');
    try {
      const totalCount = products.length;
      await deleteAllProducts();
      setSelectedIds([]);
      setIsDeleteAllModalOpen(false);
      setDeleteAllConfirmText('');
      setBulkDeleteSuccess(`All ${totalCount} crackers permanently deleted from stock.`);
      setTimeout(() => setBulkDeleteSuccess(''), 4000);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Delete all error:', err);
      setBulkDeleteError(err.message || 'Failed to delete all stock.');
    } finally {
      setIsBulkDeleting(false);
    }
  }

  // ----------------------------------------------------
  // MANUAL ADD / EDIT
  // ----------------------------------------------------
  function handleOpenAdd() {
    setEditingProduct({
      id: null,
      name: '',
      category: 'General',
      price: '',
      quantity: '',
      unit: 'box',
      low_stock_level: 10,
      video_url: '',
      qr_code: `CRK-${Date.now().toString(36).toUpperCase()}`
    });
    setIsEditModalOpen(true);
  }

  function handleOpenEdit(product) {
    setEditingProduct({ ...product });
    setIsEditModalOpen(true);
  }

  async function handleSaveProduct(e) {
    e.preventDefault();
    try {
      if (editingProduct.id) {
        await updateProduct(editingProduct.id, {
          name: editingProduct.name,
          category: editingProduct.category,
          price: parseFloat(editingProduct.price) || 0,
          quantity: Math.max(0, parseInt(editingProduct.quantity, 10) || 0),
          unit: editingProduct.unit || 'box',
          low_stock_level: Math.max(0, parseInt(editingProduct.low_stock_level, 10) || 10),
          video_url: editingProduct.video_url || '',
          qr_code: editingProduct.qr_code
        });
      } else {
        await addProduct(editingProduct);
      }
      setIsEditModalOpen(false);
      setEditingProduct(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Error saving cracker: ' + err.message);
    }
  }

  async function handleDelete(product) {
    if (window.confirm(`Are you sure you want to delete "${product.name}"? This will remove it from current stock.`)) {
      try {
        await deleteProduct(product.id);
        setSelectedIds(prev => prev.filter(id => id !== product.id));
        if (onRefresh) onRefresh();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }
  }

  // ----------------------------------------------------
  // FILE UPLOAD (EXCEL, CSV, PDF, WORD)
  // ----------------------------------------------------
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    setUploadError('');
    setReviewItems([]);

    const fileName = file.name.toLowerCase();

    try {
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
        // Direct Client-Side Excel/CSV parsing
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawRows || rawRows.length < 2) {
          throw new Error('Spreadsheet appears empty or has no data rows.');
        }

        // Header detection heuristics
        const headers = rawRows[0].map(h => String(h || '').trim().toLowerCase());
        let nameIdx = headers.findIndex(h => h.includes('item') || h.includes('name') || h.includes('cracker') || h.includes('product') || h.includes('description'));
        let qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('count') || h.includes('boxes'));
        let priceIdx = headers.findIndex(h => h.includes('rate') || h.includes('price') || h.includes('mrp') || h.includes('cost') || h.includes('amount'));

        if (nameIdx === -1) nameIdx = 0;
        if (qtyIdx === -1) qtyIdx = 1;
        if (priceIdx === -1) priceIdx = 2;

        const extracted = [];
        for (let r = 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || !row[nameIdx]) continue;
          const name = String(row[nameIdx]).trim();
          const quantity = Math.max(0, parseInt(row[qtyIdx], 10) || 1);
          const price = Math.max(0, parseFloat(row[priceIdx]) || 0);

          if (name) {
            extracted.push({
              name,
              quantity,
              price,
              unit: 'box',
              category: 'General'
            });
          }
        }

        if (extracted.length === 0) {
          throw new Error('No cracker records could be extracted from this spreadsheet.');
        }

        setReviewItems(extracted);
      } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
        // Extract text in the browser using Mammoth, then send text to Edge Function
        try {
          const arrayBuffer = await file.arrayBuffer();
          const mammothResult = await mammoth.extractRawText({ arrayBuffer });
          const extractedText = mammothResult?.value || '';

          if (!extractedText.trim()) {
            throw new Error('Could not extract any readable text from this Word document.');
          }

          if (isSupabaseConfigured && supabase) {
            const { data, error } = await supabase.functions.invoke('parse-stock-list', {
              body: {
                text: extractedText,
                fileName: file.name
              }
            });

            if (error) {
              let realErrMsg = error.message;
              if (error.context) {
                try {
                  const errJson = await error.context.json();
                  if (errJson?.error) realErrMsg = errJson.error;
                } catch {
                  try {
                    const text = await error.context.text();
                    if (text) realErrMsg = text;
                  } catch {}
                }
              }
              throw new Error(realErrMsg);
            }

            if (data?.items && Array.isArray(data.items)) {
              setReviewItems(data.items);
            } else {
              throw new Error('Invalid response format from Gemini document parser.');
            }
          } else {
            throw new Error('Supabase is not configured. Please check environment variables.');
          }
        } catch (docxErr) {
          setUploadError('Word parser error: ' + (docxErr.message || String(docxErr)));
        } finally {
          setUploadLoading(false);
        }
        return;
      } else if (fileName.endsWith('.pdf') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png')) {
        // Send PDF / image as base64 to Supabase Edge Function
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Data = reader.result.split(',')[1];
            const mimeType = file.type || (fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

            if (isSupabaseConfigured && supabase) {
              const { data, error } = await supabase.functions.invoke('parse-stock-list', {
                body: {
                  fileBase64: base64Data,
                  mimeType,
                  fileName: file.name
                }
              });

              if (error) {
                let realErrMsg = error.message;
                if (error.context) {
                  try {
                    const errJson = await error.context.json();
                    if (errJson?.error) realErrMsg = errJson.error;
                  } catch {
                    try {
                      const text = await error.context.text();
                      if (text) realErrMsg = text;
                    } catch {}
                  }
                }
                throw new Error(realErrMsg);
              }

              if (data?.items && Array.isArray(data.items)) {
                setReviewItems(data.items);
              } else {
                throw new Error('Invalid response format from Gemini document parser.');
              }
            } else {
              throw new Error('Supabase is not configured. Please check environment variables.');
            }
          } catch (fnErr) {
            setUploadError('Gemini reading error: ' + (fnErr.message || 'Please ensure GEMINI_API_KEY is configured in Supabase Edge Function'));
          } finally {
            setUploadLoading(false);
          }
        };
        reader.readAsDataURL(file);
        return;
      } else {
        throw new Error('Unsupported format. Please upload an Excel (.xlsx, .xls), CSV, Word (.docx), or PDF file.');
      }
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadLoading(false);
    }
  }

  // ----------------------------------------------------
  // CONFIRM & SAVE REVIEWED ITEMS TO STOCK
  // ----------------------------------------------------
  async function handleConfirmReviewItems() {
    if (reviewItems.length === 0) return;

    try {
      for (const item of reviewItems) {
        if (!item.name || !item.name.trim()) continue;

        // Check if cracker exists by name (case-insensitive)
        const existing = products.find(p => p.name.trim().toLowerCase() === item.name.trim().toLowerCase());

        if (existing) {
          if (duplicateAction === 'add') {
            const addedQty = Math.max(0, parseInt(item.quantity, 10) || 0);
            await updateProduct(existing.id, {
              quantity: (existing.quantity || 0) + addedQty,
              price: item.price ? parseFloat(item.price) : existing.price
            });
          }
        } else {
          await addProduct({
            name: item.name.trim(),
            category: item.category || 'General',
            price: parseFloat(item.price) || 0,
            quantity: Math.max(0, parseInt(item.quantity, 10) || 0),
            unit: item.unit || 'box',
            low_stock_level: 10,
            video_url: '',
            qr_code: `CRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`
          });
        }
      }

      setIsUploadModalOpen(false);
      setReviewItems([]);
      alert(`Stock successfully updated with ${reviewItems.length} items!`);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Error saving imported items: ' + err.message);
    }
  }

  // List of selected product names for confirmation preview
  const selectedProductNames = useMemo(() => {
    return products
      .filter(p => selectedIds.includes(p.id))
      .map(p => p.name);
  }, [products, selectedIds]);

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto w-full">
      {/* Stock Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-light-on-surface">
            Stock Inventory
          </h1>
          <p className="font-body text-xs md:text-sm text-light-on-surface-variant">
            Manage crackers, live stock quantities, pricing and demo videos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActivePage('qr-stickers')}
            className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-1.5 rounded-md bg-peacock-blue text-white font-label text-xs sm:text-sm font-bold hover:opacity-95 shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
            <span>QR Stickers</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReviewItems([]);
              setUploadError('');
              setIsUploadModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-1.5 rounded-md bg-light-surface-container-lowest text-deep-green border border-gold-border font-label text-xs sm:text-sm font-bold hover:bg-gold-soft shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            <span>Upload List</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-1.5 rounded-md bg-gold text-on-gold border border-gold-border font-label text-xs sm:text-sm font-bold hover:opacity-90 shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Add Cracker</span>
          </button>
        </div>
      </div>

      {/* Global Success / Error Alerts */}
      {bulkDeleteSuccess && (
        <div className="p-3.5 rounded-lg bg-light-primary-container text-deep-green border border-deep-green/30 font-label text-xs sm:text-sm font-bold flex items-center justify-between gap-2 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span>{bulkDeleteSuccess}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setBulkDeleteSuccess('')} 
            className="text-deep-green hover:opacity-75"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {bulkDeleteError && (
        <div className="p-3.5 rounded-lg bg-red-soft text-bright-red border border-bright-red/30 font-label text-xs sm:text-sm font-bold flex items-center justify-between gap-2 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{bulkDeleteError}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setBulkDeleteError('')} 
            className="text-bright-red hover:opacity-75"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Search & Category Filter Bar */}
      <div className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-3 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-deep-green text-[20px]">
            search
          </span>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search cracker name, category, or QR code..."
            className="w-full min-h-11 pl-10 pr-4 py-2 rounded-md bg-light-surface-container-lowest border border-gold-border text-xs sm:text-sm font-body text-light-on-surface focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-label whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-deep-green text-white font-bold'
                  : 'bg-light-surface-container-low text-light-on-surface hover:bg-gold-soft border border-light-outline-variant'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* BULK ACTION BAR: Visible when 1 or more items are selected     */}
      {/* ------------------------------------------------------------- */}
      {selectedIds.length > 0 && (
        <div className="bg-red-50 border-2 border-bright-red/40 rounded-lg p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-bright-red text-white flex items-center justify-center font-mono text-xs font-bold shrink-0">
              {selectedIds.length}
            </span>
            <span className="font-label text-xs sm:text-sm font-bold text-light-on-surface">
              {selectedIds.length} {selectedIds.length === 1 ? 'cracker' : 'crackers'} selected
              {filteredProducts.length !== products.length && (
                <span className="text-light-on-surface-variant font-normal ml-1">
                  (of {filteredProducts.length} shown)
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleClearSelection}
              disabled={isBulkDeleting}
              className="min-h-10 px-3.5 py-1.5 rounded-md bg-white border border-light-outline-variant font-label text-xs font-bold text-light-on-surface hover:bg-light-surface-container transition-colors disabled:opacity-50"
            >
              Clear selection
            </button>

            <button
              type="button"
              onClick={() => {
                setBulkDeleteError('');
                setIsDeleteSelectedModalOpen(true);
              }}
              disabled={isBulkDeleting}
              className="min-h-10 px-4 py-1.5 rounded-md bg-bright-red text-white font-label text-xs font-bold hover:opacity-90 active:scale-98 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. DESKTOP / TABLET STOCK TABLE (>= 768px)                     */}
      {/* ------------------------------------------------------------- */}
      <div className="hidden md:block bg-light-surface-container-lowest border border-gold-border rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-light-primary-container text-deep-green border-b border-gold-border">
              <tr>
                {/* Select All Checkbox */}
                <th scope="col" className="w-12 px-3 py-3 text-center">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={el => { if (el) el.indeterminate = isSomeSelected && !isAllSelected; }}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded text-gold focus:ring-gold border-gold-border cursor-pointer accent-gold"
                      title={isAllSelected ? "Deselect all shown" : "Select all currently shown"}
                      aria-label="Select all shown crackers"
                    />
                  </div>
                </th>
                <th scope="col" className="px-3 py-3 font-label text-xs font-bold uppercase tracking-wider">
                  Cracker Name
                </th>
                <th scope="col" className="px-3 py-3 font-label text-xs font-bold uppercase tracking-wider">
                  Category
                </th>
                <th scope="col" className="px-3 py-3 text-right font-label text-xs font-bold uppercase tracking-wider">
                  Price (₹)
                </th>
                <th scope="col" className="px-3 py-3 text-right font-label text-xs font-bold uppercase tracking-wider">
                  Quantity
                </th>
                <th scope="col" className="px-3 py-3 font-label text-xs font-bold uppercase tracking-wider">
                  Unit
                </th>
                <th scope="col" className="px-3 py-3 text-right font-label text-xs font-bold uppercase tracking-wider">
                  Reorder Level
                </th>
                <th scope="col" className="px-3 py-3 text-center font-label text-xs font-bold uppercase tracking-wider">
                  Demo Video
                </th>
                <th scope="col" className="px-4 py-3 text-center font-label text-xs font-bold uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-light-outline-variant">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  const isLow = (parseInt(p.quantity, 10) || 0) <= (parseInt(p.low_stock_level, 10) || 10);
                  const isOutOfStock = (parseInt(p.quantity, 10) || 0) === 0;

                  return (
                    <tr 
                      key={p.id}
                      className={`hover:bg-gold-soft/50 transition-colors ${
                        isSelected 
                          ? 'bg-gold-soft/60' 
                          : isOutOfStock 
                            ? 'bg-red-50/50' 
                            : ''
                      }`}
                    >
                      {/* Row Checkbox */}
                      <td className="w-12 px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(p.id)}
                            className="w-4 h-4 rounded text-gold focus:ring-gold border-gold-border cursor-pointer accent-gold"
                            title={`Select ${p.name}`}
                            aria-label={`Select ${p.name}`}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="font-title text-sm font-bold text-light-on-surface">
                            {p.name}
                          </span>
                          <span className="font-mono text-[10px] text-light-on-surface-variant">
                            {p.qr_code}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-body text-xs text-light-on-surface-variant">
                        <span className="px-2 py-0.5 rounded bg-light-surface-container border border-light-outline-variant text-[11px]">
                          {p.category || 'General'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs sm:text-sm font-bold text-light-on-surface tabular-nums">
                        ₹{parseFloat(p.price).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`font-mono text-sm sm:text-base font-bold ${
                            isOutOfStock ? 'text-bright-red' : isLow ? 'text-warning' : 'text-deep-green'
                          }`}>
                            {Math.max(0, p.quantity)}
                          </span>
                          {isOutOfStock ? (
                            <span className="px-1.5 py-0.5 rounded-full bg-bright-red text-white font-label text-[10px] font-bold">
                              OUT
                            </span>
                          ) : isLow ? (
                            <span className="px-1.5 py-0.5 rounded-full bg-warning text-white font-label text-[10px] font-bold">
                              LOW
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-body text-xs text-light-on-surface capitalize">
                        {p.unit || 'box'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-light-on-surface-variant tabular-nums">
                        {p.low_stock_level}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedVideoCracker(p)}
                          className={`w-9 h-9 rounded-md inline-flex items-center justify-center transition-colors ${
                            p.video_url
                              ? 'bg-peacock-soft text-peacock-blue hover:bg-peacock-blue hover:text-white'
                              : 'bg-light-surface-container text-light-on-surface-variant hover:bg-gold-soft hover:text-deep-green'
                          }`}
                          title={p.video_url ? 'Watch demo video' : 'Add demo video link or file'}
                        >
                          <span className={`material-symbols-outlined text-[20px] ${p.video_url ? 'fill' : ''}`}>
                            {p.video_url ? 'play_circle' : 'videocam'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="px-2.5 py-1 rounded bg-gold-soft text-deep-green border border-gold-border font-label text-xs font-bold hover:bg-gold hover:text-on-gold transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="w-8 h-8 rounded text-bright-red hover:bg-red-soft inline-flex items-center justify-center transition-colors"
                            title="Delete Cracker"
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
                  <td colSpan={9} className="px-4 py-12 text-center text-light-on-surface-variant">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-[40px] text-gold">inventory_2</span>
                      <p className="font-title text-sm font-bold">No crackers match your search or filter</p>
                      <button
                        type="button"
                        onClick={() => { setSearchTerm(''); setSelectedCategory('ALL'); }}
                        className="text-xs text-deep-green underline font-label"
                      >
                        Clear search filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. MOBILE CARD VIEW (< 768px) with Touch Tap Targets          */}
      {/* ------------------------------------------------------------- */}
      <div className="md:hidden flex flex-col gap-2.5">
        {/* Mobile Select-All header strip */}
        {filteredProducts.length > 0 && (
          <div className="flex items-center justify-between p-2.5 bg-light-surface-container-lowest border border-gold-border rounded-lg shadow-xs">
            <label className="flex items-center gap-2.5 min-h-[40px] px-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={el => { if (el) el.indeterminate = isSomeSelected && !isAllSelected; }}
                onChange={handleToggleSelectAll}
                className="w-5 h-5 rounded text-gold focus:ring-gold border-gold-border cursor-pointer accent-gold"
              />
              <span className="font-label text-xs font-bold text-light-on-surface">
                {isAllSelected ? 'Deselect All' : `Select All Shown (${filteredProducts.length})`}
              </span>
            </label>

            <span className="font-mono text-xs font-bold text-deep-green">
              {selectedIds.length} selected
            </span>
          </div>
        )}

        {filteredProducts.length > 0 ? (
          filteredProducts.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            const isLow = (parseInt(p.quantity, 10) || 0) <= (parseInt(p.low_stock_level, 10) || 10);
            const isOutOfStock = (parseInt(p.quantity, 10) || 0) === 0;

            return (
              <div 
                key={p.id}
                className={`p-3.5 rounded-lg border transition-all ${
                  isSelected 
                    ? 'bg-gold-soft/60 border-gold-border shadow-xs' 
                    : isOutOfStock 
                      ? 'bg-red-50/40 border-bright-red/30' 
                      : 'bg-light-surface-container-lowest border-gold-border shadow-xs'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Large Mobile Tap Target Checkbox (min 44x44px touch area) */}
                  <label 
                    className="min-w-[44px] min-h-[44px] -ml-2 -mt-2 flex items-center justify-center cursor-pointer select-none shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(p.id)}
                      className="w-5 h-5 rounded text-gold focus:ring-gold border-gold-border cursor-pointer accent-gold"
                      aria-label={`Select ${p.name}`}
                    />
                  </label>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-title text-sm font-bold text-light-on-surface leading-snug">
                        {p.name}
                      </h2>
                      <span className="font-mono text-sm font-bold text-deep-green shrink-0 tabular-nums">
                        ₹{parseFloat(p.price).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded bg-light-surface-container border border-light-outline-variant font-body text-[10px] text-light-on-surface-variant">
                        {p.category || 'General'}
                      </span>
                      <span className="font-mono text-[10px] text-light-on-surface-variant">
                        {p.qr_code}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-light-outline-variant/60">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-light-on-surface-variant font-label">Stock:</span>
                        <span className={`font-mono text-sm font-bold ${
                          isOutOfStock ? 'text-bright-red' : isLow ? 'text-warning' : 'text-deep-green'
                        }`}>
                          {Math.max(0, p.quantity)} {p.unit || 'box'}
                        </span>
                        {isOutOfStock ? (
                          <span className="px-1.5 py-0.5 rounded bg-bright-red text-white text-[9px] font-bold font-label">
                            OUT
                          </span>
                        ) : isLow ? (
                          <span className="px-1.5 py-0.5 rounded bg-warning text-white text-[9px] font-bold font-label">
                            LOW
                          </span>
                        ) : null}
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center gap-1">
                        {p.video_url && (
                          <button
                            type="button"
                            onClick={() => setSelectedVideoCracker(p)}
                            className="w-8 h-8 rounded bg-peacock-soft text-peacock-blue flex items-center justify-center shrink-0"
                            title="Demo video"
                          >
                            <span className="material-symbols-outlined text-[18px]">play_circle</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          className="px-2.5 py-1 rounded bg-gold-soft text-deep-green border border-gold-border font-label text-xs font-bold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          className="w-8 h-8 rounded text-bright-red hover:bg-red-soft flex items-center justify-center shrink-0"
                          title="Delete Cracker"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center bg-light-surface-container-lowest border border-gold-border rounded-lg text-light-on-surface-variant">
            <span className="material-symbols-outlined text-[36px] text-gold">inventory_2</span>
            <p className="font-title text-sm font-bold mt-1">No crackers match your search</p>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. DANGER ZONE: DELETE ALL STOCK (Safely placed at bottom)      */}
      {/* ------------------------------------------------------------- */}
      <div className="mt-6 pt-5 border-t border-light-outline-variant">
        <div className="p-4 rounded-lg bg-red-50/60 border border-bright-red/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-bright-red/10 text-bright-red flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">warning</span>
            </div>
            <div>
              <p className="font-title text-sm font-bold text-light-on-surface">
                Danger Zone: Delete All Stock
              </p>
              <p className="font-body text-xs text-light-on-surface-variant">
                Permanently wipes all {products.length} crackers in the store database. Customer bills and sales history remain 100% safe.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDeleteAllConfirmText('');
              setBulkDeleteError('');
              setIsDeleteAllModalOpen(true);
            }}
            disabled={products.length === 0 || isBulkDeleting}
            className="min-h-[42px] px-4 py-2 rounded-md bg-white border-2 border-bright-red text-bright-red font-label text-xs font-bold hover:bg-bright-red hover:text-white transition-colors shadow-xs shrink-0 disabled:opacity-40"
          >
            Delete All Stock ({products.length})
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* MODAL 1: CONFIRM DELETE SELECTED CRACKERS            */}
      {/* ---------------------------------------------------- */}
      {isDeleteSelectedModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-light-surface-container-lowest border-2 border-bright-red/40 rounded-xl shadow-2xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
              <div className="flex items-center gap-2 text-bright-red">
                <span className="material-symbols-outlined text-[24px]">delete_sweep</span>
                <h3 className="font-headline text-base sm:text-lg font-bold text-light-on-surface">
                  Delete Selected Crackers
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteSelectedModalOpen(false)}
                disabled={isBulkDeleting}
                className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-title text-sm font-bold text-light-on-surface">
                Delete {selectedIds.length} {selectedIds.length === 1 ? 'cracker' : 'crackers'}? This cannot be undone.
              </p>
              <p className="font-body text-xs text-light-on-surface-variant leading-relaxed">
                These crackers will be removed from your stock inventory. Existing customer bills, bills history, and sales analytics will remain completely intact.
              </p>

              {/* Preview chip list of crackers being deleted */}
              <div className="max-h-36 overflow-y-auto border border-light-outline-variant rounded-md p-2 bg-light-surface-container-low flex flex-wrap gap-1.5 mt-1">
                {selectedProductNames.map((name, i) => (
                  <span 
                    key={i} 
                    className="px-2 py-0.5 rounded bg-white border border-light-outline-variant font-title text-xs text-light-on-surface truncate max-w-full"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {bulkDeleteError && (
              <p className="font-label text-xs font-bold text-bright-red bg-red-soft p-2 rounded">
                {bulkDeleteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-light-outline-variant">
              <button
                type="button"
                onClick={() => setIsDeleteSelectedModalOpen(false)}
                disabled={isBulkDeleting}
                className="min-h-10 px-4 rounded-md border border-light-outline-variant font-label text-xs font-bold text-light-on-surface hover:bg-light-surface-container"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteSelected}
                disabled={isBulkDeleting || selectedIds.length === 0}
                className="min-h-10 px-5 rounded-md bg-bright-red text-white font-label text-xs font-bold hover:opacity-90 active:scale-98 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    <span>Delete {selectedIds.length} Crackers</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 2: CONFIRM DELETE ALL STOCK (Type DELETE)     */}
      {/* ---------------------------------------------------- */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-light-surface-container-lowest border-2 border-bright-red rounded-xl shadow-2xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
              <div className="flex items-center gap-2 text-bright-red">
                <span className="material-symbols-outlined text-[26px]">warning</span>
                <h3 className="font-headline text-base sm:text-lg font-bold text-bright-red">
                  Delete ALL Stock Inventory
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                disabled={isBulkDeleting}
                className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="p-3 rounded-lg bg-red-soft text-bright-red border border-bright-red/30 text-xs font-body leading-relaxed">
                <strong>CRITICAL WARNING:</strong> This will permanently delete <strong>all {products.length} crackers</strong> currently in the products database. This action cannot be reversed!
              </div>

              <p className="font-body text-xs text-light-on-surface-variant">
                To confirm that you want to delete every cracker in the store, please type <strong className="font-mono text-bright-red font-bold">DELETE</strong> in the box below:
              </p>

              <input
                type="text"
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                autoFocus
                className="min-h-11 px-3 py-2 rounded-md border-2 border-bright-red/40 font-mono text-center text-sm font-bold text-bright-red tracking-wider focus:outline-none focus:ring-2 focus:ring-bright-red"
              />
            </div>

            {bulkDeleteError && (
              <p className="font-label text-xs font-bold text-bright-red bg-red-soft p-2 rounded">
                {bulkDeleteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-light-outline-variant">
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                disabled={isBulkDeleting}
                className="min-h-10 px-4 rounded-md border border-light-outline-variant font-label text-xs font-bold text-light-on-surface hover:bg-light-surface-container"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={deleteAllConfirmText.trim() !== 'DELETE' || isBulkDeleting}
                className="min-h-10 px-5 rounded-md bg-bright-red text-white font-label text-xs font-bold hover:opacity-90 active:scale-98 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40"
              >
                {isBulkDeleting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    <span>Deleting All...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                    <span>Permanently Delete All ({products.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* ADD / EDIT MODAL                                     */}
      {/* ---------------------------------------------------- */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-light-surface-container-lowest border-2 border-gold-border rounded-lg shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
              <h3 className="font-headline text-lg font-bold text-light-on-surface">
                {editingProduct.id ? 'Edit Cracker' : 'Add New Cracker'}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-label text-xs font-semibold text-light-on-surface">Cracker Name *</span>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  placeholder="e.g. 1000 Wala Garland"
                  className="min-h-10 px-3 py-2 rounded-md border border-gold-border font-body text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">Category</span>
                  <input
                    type="text"
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    placeholder="e.g. Garlands, Sparklers"
                    className="min-h-10 px-3 py-2 rounded-md border border-gold-border font-body text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">Unit</span>
                  <select
                    value={editingProduct.unit}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    className="min-h-10 px-3 py-2 rounded-md border border-gold-border font-body text-sm bg-white"
                  >
                    <option value="box">Box</option>
                    <option value="packet">Packet</option>
                    <option value="piece">Piece</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">Price (₹) *</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                    placeholder="Rate"
                    className="min-h-10 px-3 py-2 rounded-md border border-gold-border font-mono text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">Stock Quantity *</span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingProduct.quantity}
                    onChange={(e) => setEditingProduct({ ...editingProduct, quantity: e.target.value })}
                    placeholder="Units in store"
                    className="min-h-10 px-3 py-2 rounded-md border border-gold-border font-mono text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">Reorder / Low Stock Level</span>
                  <input
                    type="number"
                    min="0"
                    value={editingProduct.low_stock_level}
                    onChange={(e) => setEditingProduct({ ...editingProduct, low_stock_level: e.target.value })}
                    className="min-h-10 px-3 py-2 rounded-md border border-gold-border font-mono text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-label text-xs font-semibold text-light-on-surface">QR Code Value</span>
                  <input
                    type="text"
                    value={editingProduct.qr_code}
                    onChange={(e) => setEditingProduct({ ...editingProduct, qr_code: e.target.value })}
                    className="min-h-10 px-3 py-2 rounded-md border border-gold-border font-mono text-xs"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-label text-xs font-semibold text-light-on-surface">Demo Video Link (Optional)</span>
                <input
                  type="url"
                  value={editingProduct.video_url}
                  onChange={(e) => setEditingProduct({ ...editingProduct, video_url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="min-h-10 px-3 py-2 rounded-md border border-gold-border font-body text-xs"
                />
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-light-outline-variant">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-md border border-gold-border font-label text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 rounded-md bg-gold text-on-gold border border-gold-border font-label text-xs font-bold hover:opacity-90"
                >
                  Save Cracker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* UPLOAD & REVIEW MODAL (EXCEL / PDF / WORD)           */}
      {/* ---------------------------------------------------- */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-light-surface-container-lowest border-2 border-gold-border rounded-lg shadow-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-gold text-[24px]">upload_file</span>
                <h3 className="font-headline text-lg font-bold text-light-on-surface">
                  Upload Stock List (Excel, CSV, PDF, or Word)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Drop / Select zone */}
            <div className="p-5 rounded-lg border-2 border-dashed border-gold-border bg-gold-soft/50 text-center flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-deep-green text-[36px]">folder_open</span>
              <p className="font-title text-sm font-bold text-deep-green">
                Choose stock invoice or supplier file
              </p>
              <p className="font-body text-xs text-light-on-surface-variant max-w-md">
                Excel & CSV are parsed directly; PDF and Word are read using Gemini AI through the Supabase Edge Function.
              </p>
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md bg-deep-green text-white font-label text-xs font-bold hover:opacity-95 shadow-xs mt-1">
                <span className="material-symbols-outlined text-[18px]">attachment</span>
                <span>Select Document File</span>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv, .pdf, .docx, .doc"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploadLoading}
                />
              </label>
            </div>

            {uploadLoading && (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-deep-green">
                <span className="material-symbols-outlined animate-spin text-[32px]">progress_activity</span>
                <span className="font-label text-xs font-bold">Analyzing document & extracting crackers...</span>
              </div>
            )}

            {uploadError && (
              <div className="p-3 rounded-md bg-red-soft text-bright-red border border-bright-red/30 font-label text-xs font-bold">
                {uploadError}
              </div>
            )}

            {/* Review & Edit Table */}
            {reviewItems.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-light-primary-container p-2.5 rounded-md">
                  <span className="font-label text-xs font-bold text-deep-green">
                    Extracted {reviewItems.length} items. Review and edit values before confirming:
                  </span>
                  
                  {/* Handling for existing items */}
                  <div className="flex items-center gap-2 text-xs font-label">
                    <span className="text-deep-green font-bold">If item exists:</span>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="dupAction"
                        checked={duplicateAction === 'add'}
                        onChange={() => setDuplicateAction('add')}
                        className="text-gold"
                      />
                      <span>Add to quantity</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="dupAction"
                        checked={duplicateAction === 'skip'}
                        onChange={() => setDuplicateAction('skip')}
                        className="text-gold"
                      />
                      <span>Skip</span>
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto border border-gold-border rounded-md max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-light-surface-container-low text-light-on-surface border-b border-light-outline-variant sticky top-0">
                      <tr>
                        <th className="px-3 py-2 font-label font-bold">#</th>
                        <th className="px-3 py-2 font-label font-bold">Detected Name</th>
                        <th className="px-3 py-2 text-right font-label font-bold">Quantity</th>
                        <th className="px-3 py-2 text-right font-label font-bold">Price (₹)</th>
                        <th className="px-3 py-2 text-center font-label font-bold">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-light-outline-variant">
                      {reviewItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gold-soft/30">
                          <td className="px-3 py-2 font-mono text-light-on-surface-variant">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const copy = [...reviewItems];
                                copy[idx].name = e.target.value;
                                setReviewItems(copy);
                              }}
                              className="w-full px-2 py-1 rounded border border-light-outline-variant font-title font-medium"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={item.quantity}
                              onChange={(e) => {
                                const copy = [...reviewItems];
                                copy[idx].quantity = e.target.value;
                                setReviewItems(copy);
                              }}
                              className="w-20 px-2 py-1 rounded border border-light-outline-variant font-mono text-right ml-auto block"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => {
                                const copy = [...reviewItems];
                                copy[idx].price = e.target.value;
                                setReviewItems(copy);
                              }}
                              className="w-24 px-2 py-1 rounded border border-light-outline-variant font-mono text-right ml-auto block"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setReviewItems(reviewItems.filter((_, i) => i !== idx));
                              }}
                              className="w-7 h-7 rounded text-bright-red hover:bg-red-soft inline-flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-light-outline-variant">
                  <span className="text-xs text-light-on-surface-variant font-body">
                    Nothing is saved until you click Confirm below.
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewItems([]);
                        setIsUploadModalOpen(false);
                      }}
                      className="px-4 py-2 rounded-md border border-gold-border font-label text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmReviewItems}
                      className="px-5 py-2 rounded-md bg-gold text-on-gold border border-gold-border font-label text-xs font-bold hover:opacity-90 shadow-sm"
                    >
                      Confirm & Save Stock ({reviewItems.length} items)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Demo Video Modal */}
      <VideoModal
        cracker={selectedVideoCracker}
        isOpen={Boolean(selectedVideoCracker)}
        onClose={() => setSelectedVideoCracker(null)}
        onUpdated={onRefresh}
      />
    </div>
  );
}
