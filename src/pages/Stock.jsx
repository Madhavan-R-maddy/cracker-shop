import React, { useState, useMemo } from 'react';
import { 
  addProduct, 
  addProductsBatch,
  updateProduct, 
  deleteProduct, 
  deleteProducts, 
  deleteAllProducts, 
  supabase, 
  isSupabaseConfigured 
} from '../lib/supabase';
import {
  parseExcelOrCsv,
  parseWordDocument,
  parsePdfDocument,
  parsePlainText,
  fileToBase64,
  invokeGeminiParserWithRetry,
  guessCategory
} from '../lib/stockParser';
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
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const [bulkDeleteSuccess, setBulkDeleteSuccess] = useState('');

  // Upload & Review state
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadErrorObj, setUploadErrorObj] = useState(null); // { friendly: string, raw: string, canRetry: boolean }
  const [lastUploadedFile, setLastUploadedFile] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [duplicateAction, setDuplicateAction] = useState('add'); // 'add' or 'skip'
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

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
      setIsDeleteMode(false);
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
      setIsDeleteMode(false);
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
  // FILE UPLOAD & PARSING (EXCEL, CSV, WORD, PDF, IMAGES, TXT)
  // ----------------------------------------------------
  async function handleProcessFile(file) {
    if (!file) return;

    setUploadLoading(true);
    setUploadProgressMsg('Reading your file...');
    setUploadError('');
    setUploadErrorObj(null);
    setImportError('');
    setLastUploadedFile(file);

    const fileName = file.name.toLowerCase();

    try {
      let rawExtractedItems = [];

      // 1. Unsupported legacy binary Word format
      if (fileName.endsWith('.doc')) {
        throw new Error("The legacy Word format '.doc' is not supported directly. Please open it in Microsoft Word or Google Docs and save it as .docx, .xlsx, or PDF before uploading.");
      }

      // 2. Excel (.xlsx, .xls) and CSV -> Direct browser parse
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
        setUploadProgressMsg('Reading spreadsheet directly in browser...');
        rawExtractedItems = await parseExcelOrCsv(file);
      }
      // 3. Word (.docx) -> Local table extraction or Gemini text parsing
      else if (fileName.endsWith('.docx')) {
        setUploadProgressMsg('Reading Word document...');
        const res = await parseWordDocument(file);
        if (res.items && Array.isArray(res.items)) {
          rawExtractedItems = res.items;
        } else if (res.needsAI) {
          setUploadProgressMsg('Analyzing Word text with Gemini AI...');
          rawExtractedItems = await invokeGeminiParserWithRetry({
            text: res.text,
            fileName: file.name,
            onProgress: setUploadProgressMsg
          });
        }
      }
      // 4. PDF (.pdf) -> Local pdf.js text or Gemini OCR
      else if (fileName.endsWith('.pdf')) {
        setUploadProgressMsg('Reading PDF document in browser...');
        const res = await parsePdfDocument(file);
        if (res.items && Array.isArray(res.items)) {
          rawExtractedItems = res.items;
        } else if (res.isScannedPdf) {
          setUploadProgressMsg('Scanned PDF detected. Reading with Gemini AI OCR...');
          const base64Data = await fileToBase64(file);
          rawExtractedItems = await invokeGeminiParserWithRetry({
            fileBase64: base64Data,
            mimeType: 'application/pdf',
            fileName: file.name,
            onProgress: setUploadProgressMsg
          });
        } else if (res.needsAI && res.text) {
          setUploadProgressMsg('Analyzing PDF content with Gemini AI...');
          rawExtractedItems = await invokeGeminiParserWithRetry({
            text: res.text,
            fileName: file.name,
            onProgress: setUploadProgressMsg
          });
        }
      }
      // 5. Scanned Images (.jpg, .jpeg, .png) -> Gemini OCR
      else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png')) {
        setUploadProgressMsg('Analyzing photo / invoice with Gemini AI...');
        const base64Data = await fileToBase64(file);
        const mimeType = file.type || (fileName.endsWith('.png') ? 'image/png' : 'image/jpeg');
        rawExtractedItems = await invokeGeminiParserWithRetry({
          fileBase64: base64Data,
          mimeType,
          fileName: file.name,
          onProgress: setUploadProgressMsg
        });
      }
      // 6. Plain Text (.txt) -> Direct browser parse or Gemini text
      else if (fileName.endsWith('.txt')) {
        setUploadProgressMsg('Reading text file in browser...');
        const res = await parsePlainText(file);
        if (res.items && Array.isArray(res.items)) {
          rawExtractedItems = res.items;
        } else if (res.needsAI) {
          setUploadProgressMsg('Analyzing text list with Gemini AI...');
          rawExtractedItems = await invokeGeminiParserWithRetry({
            text: res.text,
            fileName: file.name,
            onProgress: setUploadProgressMsg
          });
        }
      }
      // 7. Unsupported format
      else {
        const ext = file.name.includes('.') ? file.name.split('.').pop() : 'unknown';
        throw new Error(`The file type '.${ext}' is not supported. Please save your file as .docx, .xlsx, or PDF before uploading.`);
      }

      if (!rawExtractedItems || rawExtractedItems.length === 0) {
        throw new Error('No cracker records could be found in the uploaded file.');
      }

      // Map raw extracted items, matching against current Supabase products
      const mapped = rawExtractedItems.map((item) => {
        const cleanItemName = String(item.name || '').trim();
        // Match case-insensitively, ignoring extra spaces
        const existing = products.find(p => 
          p.name.trim().toLowerCase() === cleanItemName.toLowerCase()
        );

        return {
          name: cleanItemName,
          category: item.category || guessCategory(cleanItemName),
          quantity: Math.max(0, parseInt(item.quantity, 10) || 0),
          price: Math.max(0, parseFloat(item.price) || 0),
          unit: item.unit ? String(item.unit).toLowerCase().trim() : 'box',
          isExisting: Boolean(existing),
          existingProduct: existing || null,
          dupAction: duplicateAction // default 'add' or 'skip'
        };
      });

      setReviewItems(mapped);
    } catch (err) {
      console.error('File parsing error:', err);
      const isBusy = (
        err.isAiBusy ||
        err.status === 429 ||
        err.status === 503 ||
        /busy|503|429|timeout|overloaded|resource exhausted/i.test(err.message || '')
      );

      if (isBusy) {
        const friendlyMsg = 'The AI service is temporarily busy. Please click "Try again" or upload an Excel, CSV, or Word file.';
        setUploadError(friendlyMsg);
        setUploadErrorObj({
          friendly: friendlyMsg,
          raw: err.rawDetails || err.message || String(err),
          canRetry: true
        });
      } else {
        const friendlyMsg = err.message || 'Failed to process document.';
        setUploadError(friendlyMsg);
        setUploadErrorObj({
          friendly: friendlyMsg,
          raw: err.rawDetails || err.message || String(err),
          canRetry: false
        });
      }
    } finally {
      setUploadLoading(false);
      setUploadProgressMsg('');
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    // reset input so uploading same file again triggers onChange
    e.target.value = '';
  }

  function handleSetGlobalDuplicateAction(action) {
    setDuplicateAction(action);
    setReviewItems(prev => prev.map(item => {
      if (item.isExisting) {
        return { ...item, dupAction: action };
      }
      return item;
    }));
  }

  function handleToggleRowDuplicateAction(idx, action) {
    setReviewItems(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], dupAction: action };
      return copy;
    });
  }

  function handleUpdateReviewItem(idx, field, value) {
    setReviewItems(prev => {
      const copy = [...prev];
      const item = { ...copy[idx], [field]: value };

      // If user edits name, re-check duplicate status against existing products
      if (field === 'name') {
        const cleanName = String(value || '').trim();
        const existing = products.find(p => 
          p.name.trim().toLowerCase() === cleanName.toLowerCase()
        );
        item.isExisting = Boolean(existing);
        item.existingProduct = existing || null;
      }

      copy[idx] = item;
      return copy;
    });
  }

  function handleRemoveReviewItem(idx) {
    setReviewItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ----------------------------------------------------
  // CONFIRM & BATCH IMPORT REVIEWED ITEMS TO SUPABASE
  // ----------------------------------------------------
  async function handleConfirmReviewItems() {
    if (reviewItems.length === 0) return;

    // Filter valid non-empty items
    const validItems = reviewItems.filter(item => item.name && item.name.trim());
    if (validItems.length === 0) {
      setImportError('Please enter at least one valid cracker name.');
      return;
    }

    const itemsToImport = validItems.filter(item => !item.isExisting || item.dupAction === 'add');
    if (itemsToImport.length === 0) {
      setImportError('All items are set to "Skip". Change at least one existing item to "Add to existing quantity" or add new crackers.');
      return;
    }

    setIsImporting(true);
    setImportError('');

    try {
      // 1. Separate new items vs existing items to update
      const newItems = validItems.filter(item => !item.isExisting);
      const existingItemsToUpdate = validItems.filter(item => item.isExisting && item.dupAction === 'add');

      // 2. Batch insert new items into Supabase
      if (newItems.length > 0) {
        await addProductsBatch(newItems);
      }

      // 3. Update existing items in Supabase
      for (const item of existingItemsToUpdate) {
        const existing = item.existingProduct;
        const addQty = Math.max(0, parseInt(item.quantity, 10) || 0);
        const newQty = (existing.quantity || 0) + addQty;
        const newPrice = item.price > 0 ? parseFloat(item.price) : existing.price;

        await updateProduct(existing.id, {
          quantity: newQty,
          price: newPrice
        });
      }

      const totalImported = newItems.length + existingItemsToUpdate.length;
      setBulkDeleteSuccess(`Successfully imported ${totalImported} ${totalImported === 1 ? 'cracker' : 'crackers'} into stock!`);
      setTimeout(() => setBulkDeleteSuccess(''), 5000);

      // Reset and close
      setReviewItems([]);
      setUploadError('');
      setUploadErrorObj(null);
      setIsUploadModalOpen(false);

      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Import error:', err);
      // Keep review table open so user does not lose their edits!
      setImportError(`Database error during import: ${err.message || String(err)}`);
    } finally {
      setIsImporting(false);
    }
  }

  // List of selected product names for confirmation preview
  const selectedProductNames = useMemo(() => {
    return products
      .filter(p => selectedIds.includes(p.id))
      .map(p => p.name);
  }, [products, selectedIds]);

  // Statistics and highlights for review modal
  const reviewStats = useMemo(() => {
    const total = reviewItems.length;
    const newCount = reviewItems.filter(i => !i.isExisting).length;
    const existingCount = reviewItems.filter(i => i.isExisting).length;
    const activeImportCount = reviewItems.filter(i => !i.isExisting || i.dupAction === 'add').length;
    const skippedCount = reviewItems.filter(i => i.isExisting && i.dupAction === 'skip').length;
    const warningCount = reviewItems.filter(i => !i.price || i.price === 0 || !i.quantity || i.quantity === 0).length;
    return { total, newCount, existingCount, activeImportCount, skippedCount, warningCount };
  }, [reviewItems]);

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
              setUploadErrorObj(null);
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

          {!isDeleteMode && (
            <button
              type="button"
              onClick={() => {
                setIsDeleteMode(true);
                setBulkDeleteError('');
                setBulkDeleteSuccess('');
              }}
              className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-1.5 rounded-md bg-light-surface-container-lowest border-2 border-bright-red text-bright-red font-label text-xs sm:text-sm font-bold hover:bg-bright-red hover:text-white transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>Delete</span>
            </button>
          )}
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
      {/* DELETE MODE ACTION BAR: Visible while in Delete Mode          */}
      {/* ------------------------------------------------------------- */}
      {isDeleteMode && (
        <div className="bg-red-50 border-2 border-bright-red/50 rounded-lg p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-bright-red text-white flex items-center justify-center font-mono text-xs sm:text-sm font-bold shrink-0 shadow-xs">
              {selectedIds.length}
            </span>
            <div className="flex flex-col">
              <span className="font-label text-xs sm:text-sm font-bold text-light-on-surface">
                {selectedIds.length} selected
                {filteredProducts.length !== products.length && (
                  <span className="text-light-on-surface-variant font-normal ml-1">
                    (of {filteredProducts.length} shown)
                  </span>
                )}
              </span>
              <span className="font-body text-[11px] text-light-on-surface-variant">
                Select crackers below or choose Delete All Stock
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setBulkDeleteError('');
                setIsDeleteSelectedModalOpen(true);
              }}
              disabled={selectedIds.length === 0 || isBulkDeleting}
              className="min-h-10 px-4 py-2 rounded-md bg-bright-red text-white font-label text-xs sm:text-sm font-bold hover:opacity-90 active:scale-98 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span>Delete Selected{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDeleteAllConfirmText('');
                setBulkDeleteError('');
                setIsDeleteAllModalOpen(true);
              }}
              disabled={products.length === 0 || isBulkDeleting}
              className="min-h-10 px-3.5 py-2 rounded-md bg-white border-2 border-bright-red text-bright-red font-label text-xs sm:text-sm font-bold hover:bg-bright-red hover:text-white transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
              <span>Delete All Stock</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsDeleteMode(false);
                setSelectedIds([]);
                setBulkDeleteError('');
              }}
              disabled={isBulkDeleting}
              className="min-h-10 px-3.5 py-2 rounded-md bg-white border border-light-outline-variant font-label text-xs sm:text-sm font-bold text-light-on-surface hover:bg-light-surface-container transition-colors disabled:opacity-50"
            >
              Cancel
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
                {/* Select All Checkbox - Only visible in Delete Mode */}
                {isDeleteMode && (
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
                )}
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
                {/* Actions column - Only visible in Normal View (hidden in Delete Mode) */}
                {!isDeleteMode && (
                  <th scope="col" className="px-4 py-3 text-center font-label text-xs font-bold uppercase tracking-wider">
                    Actions
                  </th>
                )}
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
                      onClick={() => {
                        if (isDeleteMode) handleToggleSelect(p.id);
                      }}
                      className={`hover:bg-gold-soft/50 transition-colors ${
                        isDeleteMode ? 'cursor-pointer' : ''
                      } ${
                        isSelected 
                          ? 'bg-gold-soft/60' 
                          : isOutOfStock 
                            ? 'bg-red-50/50' 
                            : ''
                      }`}
                    >
                      {/* Row Checkbox - Only in Delete Mode */}
                      {isDeleteMode && (
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
                      )}
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
                      <td className="px-3 py-3 text-center" onClick={(e) => isDeleteMode && e.stopPropagation()}>
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
                      {/* Actions cell - Only in Normal View (hidden in Delete Mode) */}
                      {!isDeleteMode && (
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
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-light-on-surface-variant">
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
        {/* Mobile Select-All header strip - Only visible in Delete Mode */}
        {isDeleteMode && filteredProducts.length > 0 && (
          <div className="flex items-center justify-between p-2.5 bg-light-surface-container-lowest border border-gold-border rounded-lg shadow-xs">
            <label className="flex items-center gap-2.5 min-h-[44px] px-1 cursor-pointer select-none">
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
                onClick={() => {
                  if (isDeleteMode) handleToggleSelect(p.id);
                }}
                className={`p-3.5 rounded-lg border transition-all ${
                  isDeleteMode ? 'cursor-pointer' : ''
                } ${
                  isSelected 
                    ? 'bg-gold-soft/60 border-gold-border shadow-xs' 
                    : isOutOfStock 
                      ? 'bg-red-50/40 border-bright-red/30' 
                      : 'bg-light-surface-container-lowest border-gold-border shadow-xs'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Large Mobile Tap Target Checkbox (min 44x44px touch area) - Only in Delete Mode */}
                  {isDeleteMode && (
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
                  )}

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
                      <div className="flex items-center gap-1" onClick={(e) => isDeleteMode && e.stopPropagation()}>
                        {p.video_url && (
                          <button
                            type="button"
                            onClick={() => setSelectedVideoCracker(p)}
                            className="min-w-[40px] min-h-[40px] rounded bg-peacock-soft text-peacock-blue flex items-center justify-center shrink-0"
                            title="Demo video"
                          >
                            <span className="material-symbols-outlined text-[20px]">play_circle</span>
                          </button>
                        )}
                        {/* Edit and Delete buttons - Only in Normal View (hidden in Delete Mode) */}
                        {!isDeleteMode && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(p)}
                              className="min-h-[36px] px-2.5 py-1 rounded bg-gold-soft text-deep-green border border-gold-border font-label text-xs font-bold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(p)}
                              className="min-w-[36px] min-h-[36px] rounded text-bright-red hover:bg-red-soft flex items-center justify-center shrink-0"
                              title="Delete Cracker"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </>
                        )}
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
      {/* UPLOAD & REVIEW MODAL (EXCEL / CSV / PDF / WORD / IMG) */}
      {/* ---------------------------------------------------- */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-4xl bg-light-surface-container-lowest border-2 border-gold-border rounded-xl shadow-2xl p-4 sm:p-6 flex flex-col gap-4 max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-light-outline-variant pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-gold text-[26px]">upload_file</span>
                <div>
                  <h3 className="font-headline text-base sm:text-lg font-bold text-light-on-surface">
                    {reviewItems.length > 0 ? `Review & Confirm Imported Stock (${reviewItems.length})` : 'Upload Stock List'}
                  </h3>
                  <p className="font-body text-xs text-light-on-surface-variant">
                    {reviewItems.length > 0 
                      ? 'Review cracker details, adjust quantities or pricing, and confirm before adding to database' 
                      : 'Upload Excel (.xlsx, .xls), CSV, Word (.docx), PDF (text or scanned), or photo invoice'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (reviewItems.length > 0) {
                    if (window.confirm('Discard imported items and close?')) {
                      setReviewItems([]);
                      setUploadError('');
                      setUploadErrorObj(null);
                      setIsUploadModalOpen(false);
                    }
                  } else {
                    setUploadError('');
                    setUploadErrorObj(null);
                    setIsUploadModalOpen(false);
                  }
                }}
                disabled={uploadLoading || isImporting}
                className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Drop / Select zone (Visible when no review items are loaded) */}
            {reviewItems.length === 0 && (
              <div className="flex flex-col gap-3 py-2">
                <div className="p-6 sm:p-8 rounded-xl border-2 border-dashed border-gold-border bg-gold-soft/40 text-center flex flex-col items-center gap-2.5">
                  <div className="w-14 h-14 rounded-full bg-light-primary-container text-deep-green flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-[32px]">folder_open</span>
                  </div>
                  <div>
                    <p className="font-headline text-sm sm:text-base font-bold text-deep-green">
                      Select stock list file or drag & drop here
                    </p>
                    <p className="font-body text-xs text-light-on-surface-variant max-w-lg mt-1 leading-relaxed">
                      Excel (.xlsx, .xls) and CSV are parsed instantly in your browser.<br className="hidden sm:inline" /> Word (.docx) tables & clean PDFs are extracted directly; scanned PDFs and images are processed with Gemini AI.
                    </p>
                  </div>

                  <label className={`mt-2 inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-lg bg-deep-green text-white font-label text-xs sm:text-sm font-bold shadow-sm transition-all ${
                    uploadLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90 active:scale-98'
                  }`}>
                    <span className="material-symbols-outlined text-[20px]">attachment</span>
                    <span>Choose File from Computer / Phone</span>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv, .docx, .doc, .pdf, .jpg, .jpeg, .png, .txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={uploadLoading}
                    />
                  </label>
                  <span className="font-body text-[11px] text-light-on-surface-variant">
                    Supported formats: .xlsx, .xls, .csv, .docx, .pdf, .jpg, .png, .txt
                  </span>
                </div>

                {/* Progress message during extraction */}
                {uploadLoading && (
                  <div className="py-6 flex flex-col items-center justify-center gap-2.5 text-deep-green animate-in fade-in">
                    <span className="material-symbols-outlined animate-spin text-[36px]">progress_activity</span>
                    <span className="font-label text-xs sm:text-sm font-bold text-deep-green">
                      {uploadProgressMsg || 'Reading your file...'}
                    </span>
                    <span className="font-body text-[11px] text-light-on-surface-variant">
                      Please wait a moment while the crackers are extracted and verified
                    </span>
                  </div>
                )}

                {/* Friendly Error with Retry option */}
                {(uploadError || uploadErrorObj) && (
                  <div className="p-4 rounded-lg bg-red-soft text-bright-red border border-bright-red/30 flex flex-col gap-2 shadow-xs animate-in fade-in">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-[22px] shrink-0 text-bright-red mt-0.5">error</span>
                        <div className="flex flex-col gap-1">
                          <p className="font-label text-xs sm:text-sm font-bold text-bright-red">
                            {uploadError || uploadErrorObj?.friendly}
                          </p>
                          {uploadErrorObj?.canRetry && lastUploadedFile && (
                            <button
                              type="button"
                              onClick={() => handleProcessFile(lastUploadedFile)}
                              className="mt-1 self-start inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-md bg-bright-red text-white font-label text-xs font-bold hover:opacity-90 shadow-xs"
                            >
                              <span className="material-symbols-outlined text-[16px]">refresh</span>
                              <span>Try Again</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadError('');
                          setUploadErrorObj(null);
                        }}
                        className="text-bright-red hover:opacity-75"
                        title="Dismiss error"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>

                    {uploadErrorObj?.raw && uploadErrorObj.raw !== (uploadError || uploadErrorObj.friendly) && (
                      <details className="mt-1 pt-2 border-t border-bright-red/20 text-xs">
                        <summary className="cursor-pointer font-label text-[11px] text-bright-red font-semibold select-none">
                          Show technical details
                        </summary>
                        <pre className="p-2.5 bg-white/80 rounded mt-1.5 font-mono text-[10px] text-light-on-surface break-words max-h-32 overflow-y-auto whitespace-pre-wrap">
                          {uploadErrorObj.raw}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Review & Edit Table */}
            {reviewItems.length > 0 && (
              <div className="flex flex-col gap-3 min-h-0 flex-1">
                {/* Stats and Resolution Controls Header */}
                <div className="p-3 bg-light-primary-container/80 border border-gold-border rounded-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-label text-xs sm:text-sm font-bold text-deep-green">
                      Found {reviewStats.total} crackers:
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white border border-light-outline-variant font-mono text-xs font-bold text-deep-green">
                      {reviewStats.newCount} New
                    </span>
                    {reviewStats.existingCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-gold-soft border border-gold-border font-mono text-xs font-bold text-on-gold">
                        {reviewStats.existingCount} Already in Stock
                      </span>
                    )}
                    {reviewStats.warningCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-label text-xs font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        {reviewStats.warningCount} Missing Price/Qty
                      </span>
                    )}
                  </div>

                  {/* Duplicate Resolution Setting for all existing crackers */}
                  {reviewStats.existingCount > 0 && (
                    <div className="flex items-center gap-2 text-xs font-label bg-white px-3 py-1.5 rounded-md border border-light-outline-variant">
                      <span className="font-bold text-deep-green">For existing items:</span>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="globalDupAction"
                          checked={duplicateAction === 'add'}
                          onChange={() => handleSetGlobalDuplicateAction('add')}
                          className="text-deep-green accent-deep-green"
                        />
                        <span className="font-medium">Add to quantity</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="globalDupAction"
                          checked={duplicateAction === 'skip'}
                          onChange={() => handleSetGlobalDuplicateAction('skip')}
                          className="text-deep-green accent-deep-green"
                        />
                        <span className="font-medium">Skip</span>
                      </label>
                    </div>
                  )}
                </div>

                {importError && (
                  <div className="p-3 rounded-md bg-red-soft text-bright-red border border-bright-red/30 font-label text-xs font-bold flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">error</span>
                      <span>{importError}</span>
                    </div>
                    <button type="button" onClick={() => setImportError('')} className="text-bright-red hover:opacity-75">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                )}

                {/* Review Table (Scrollable container for 100+ items) */}
                <div className="overflow-x-auto border border-gold-border rounded-lg flex-1 min-h-[240px] max-h-[50vh] overflow-y-auto shadow-inner bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-light-primary-container text-deep-green border-b border-gold-border sticky top-0 z-10 shadow-xs">
                      <tr>
                        <th className="px-2.5 py-2.5 font-label font-bold w-10 text-center">#</th>
                        <th className="px-3 py-2.5 font-label font-bold min-w-[200px]">Cracker Name</th>
                        <th className="px-2.5 py-2.5 font-label font-bold min-w-[120px]">Category</th>
                        <th className="px-2.5 py-2.5 text-right font-label font-bold w-24">Quantity</th>
                        <th className="px-2.5 py-2.5 font-label font-bold w-24">Unit</th>
                        <th className="px-2.5 py-2.5 text-right font-label font-bold w-28">Price (₹)</th>
                        <th className="px-3 py-2.5 font-label font-bold min-w-[140px]">Status / Action</th>
                        <th className="px-2 py-2.5 text-center font-label font-bold w-12">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-light-outline-variant">
                      {reviewItems.map((item, idx) => {
                        const isSkipped = item.isExisting && item.dupAction === 'skip';
                        const isZeroQty = !item.quantity || parseInt(item.quantity, 10) === 0;
                        const isZeroPrice = !item.price || parseFloat(item.price) === 0;

                        return (
                          <tr 
                            key={idx} 
                            className={`transition-colors ${
                              isSkipped 
                                ? 'bg-light-surface-container-low opacity-60' 
                                : item.isExisting 
                                  ? 'bg-gold-soft/30 hover:bg-gold-soft/50' 
                                  : 'hover:bg-gold-soft/20'
                            }`}
                          >
                            <td className="px-2.5 py-2 font-mono text-center text-light-on-surface-variant tabular-nums">
                              {idx + 1}
                            </td>

                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleUpdateReviewItem(idx, 'name', e.target.value)}
                                placeholder="Cracker name"
                                className="w-full px-2.5 py-1.5 rounded border border-light-outline-variant font-title text-xs font-semibold text-light-on-surface focus:ring-1 focus:ring-gold bg-white"
                              />
                              {item.isExisting && (
                                <p className="font-body text-[10px] text-deep-green mt-0.5">
                                  In stock: <strong>{item.existingProduct.quantity} {item.existingProduct.unit}</strong> @ ₹{item.existingProduct.price}
                                </p>
                              )}
                            </td>

                            <td className="px-2.5 py-2">
                              <input
                                type="text"
                                value={item.category}
                                onChange={(e) => handleUpdateReviewItem(idx, 'category', e.target.value)}
                                placeholder="Category"
                                className="w-full px-2 py-1.5 rounded border border-light-outline-variant font-body text-xs text-light-on-surface bg-white"
                              />
                            </td>

                            <td className="px-2.5 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                value={item.quantity}
                                onChange={(e) => handleUpdateReviewItem(idx, 'quantity', e.target.value)}
                                className={`w-20 px-2 py-1.5 rounded border font-mono text-right text-xs ml-auto block bg-white ${
                                  isZeroQty ? 'border-amber-500 bg-amber-50/70 text-amber-900 font-bold' : 'border-light-outline-variant'
                                }`}
                              />
                            </td>

                            <td className="px-2.5 py-2">
                              <select
                                value={item.unit}
                                onChange={(e) => handleUpdateReviewItem(idx, 'unit', e.target.value)}
                                className="w-full px-1.5 py-1.5 rounded border border-light-outline-variant font-body text-xs bg-white"
                              >
                                <option value="box">box</option>
                                <option value="packet">packet</option>
                                <option value="piece">piece</option>
                              </select>
                            </td>

                            <td className="px-2.5 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.price}
                                onChange={(e) => handleUpdateReviewItem(idx, 'price', e.target.value)}
                                className={`w-24 px-2 py-1.5 rounded border font-mono text-right text-xs ml-auto block bg-white ${
                                  isZeroPrice ? 'border-amber-500 bg-amber-50/70 text-amber-900 font-bold' : 'border-light-outline-variant'
                                }`}
                              />
                            </td>

                            <td className="px-3 py-2">
                              {item.isExisting ? (
                                <select
                                  value={item.dupAction}
                                  onChange={(e) => handleToggleRowDuplicateAction(idx, e.target.value)}
                                  className={`px-2 py-1 rounded text-xs font-label font-bold border ${
                                    item.dupAction === 'add' 
                                      ? 'bg-light-primary-container text-deep-green border-deep-green/40' 
                                      : 'bg-light-surface-container text-light-on-surface-variant border-light-outline-variant'
                                  }`}
                                >
                                  <option value="add">Add (+{item.quantity})</option>
                                  <option value="skip">Skip</option>
                                </select>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full bg-light-primary-container text-deep-green border border-deep-green/30 font-label text-[10px] font-bold inline-block">
                                  New Cracker
                                </span>
                              )}
                            </td>

                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveReviewItem(idx)}
                                className="w-8 h-8 rounded text-bright-red hover:bg-red-soft inline-flex items-center justify-center transition-colors"
                                title="Remove cracker from import list"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-light-outline-variant shrink-0">
                  <div className="flex flex-col">
                    <span className="font-label text-xs font-bold text-light-on-surface">
                      Importing {reviewStats.activeImportCount} of {reviewStats.total} crackers
                      {reviewStats.skippedCount > 0 && (
                        <span className="text-light-on-surface-variant font-normal ml-1">
                          ({reviewStats.skippedCount} skipped)
                        </span>
                      )}
                    </span>
                    <span className="font-body text-[11px] text-light-on-surface-variant">
                      Nothing is saved until you click the Import button.
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewItems([]);
                        setUploadError('');
                        setUploadErrorObj(null);
                        setIsUploadModalOpen(false);
                      }}
                      disabled={isImporting}
                      className="min-h-10 px-4 rounded-md border border-light-outline-variant font-label text-xs font-bold text-light-on-surface hover:bg-light-surface-container transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmReviewItems}
                      disabled={isImporting || reviewStats.activeImportCount === 0}
                      className="min-h-10 px-5 rounded-md bg-gold text-on-gold border border-gold-border font-label text-xs font-bold hover:opacity-90 active:scale-98 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      {isImporting ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                          <span>Importing to Supabase...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                          <span>Import {reviewStats.activeImportCount} Crackers</span>
                        </>
                      )}
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
