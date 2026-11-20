import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import { supabase, isSupabaseConfigured } from './supabase.js';

// Configure pdfjs worker using unpkg CDN
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
}

// ----------------------------------------------------
// KEYWORDS FOR COLUMN IDENTIFICATION
// (English + common Tamil-English spellings)
// ----------------------------------------------------
const NAME_KEYWORDS = [
  'item', 'name', 'cracker', 'product', 'item name', 'cracker name', 
  'product name', 'description', 'descr', 'details', 'particulars', 
  'items', 'crackers', 'pattasu', 'porul', 'saran', 'title', 'goods'
];

const QTY_KEYWORDS = [
  'qty', 'quantity', 'stock', 'nos', 'count', 'box', 'boxes', 'en', 
  'alavu', 'pieces', 'pcs', 'pkt', 'pkts', 'packets', 'units', 
  'total qty', 'balance', 'closing', 'opening', 'available'
];

const PRICE_KEYWORDS = [
  'price', 'rate', 'mrp', 'cost', 'vilai', 'amount', 'amt', 'val', 
  'value', 'unit price', 'selling price', 'rate/box', 'rate per', 
  'net rate', 'net price', 'rs', 'inr'
];

const UNIT_KEYWORDS = [
  'unit', 'uom', 'unit type', 'packing', 'pack', 'measure'
];

const CATEGORY_KEYWORDS = [
  'category', 'type', 'cat', 'group', 'class', 'inam', 'vagaigal', 'variety'
];

// Helper: Normalize string for comparison
function cleanHeader(val) {
  return String(val || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}

// Guess category based on cracker name if category is missing
export function guessCategory(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('sparkler') || n.includes('kambi') || n.includes('pencil')) return 'Sparklers';
  if (n.includes('chakkar') || n.includes('ground') || n.includes('wheel') || n.includes('spinner') || n.includes('thara')) return 'Chakkars';
  if (n.includes('flower') || n.includes('pot') || n.includes('kotti') || n.includes('bhoomi')) return 'Flower Pots';
  if (n.includes('wala') || n.includes('garland') || n.includes('ladi') || n.includes('saram')) return 'Garlands';
  if (n.includes('shot') || n.includes('aerial') || n.includes('sky') || n.includes('rider') || n.includes('pipe') || n.includes('multy')) return 'Aerial Shots';
  if (n.includes('bomb') || n.includes('atom') || n.includes('sound') || n.includes('hydro') || n.includes('vedi')) return 'Sound Crackers';
  if (n.includes('rocket') || n.includes('missile') || n.includes('space')) return 'Rockets';
  if (n.includes('fountain') || n.includes('torch') || n.includes('laser')) return 'Novelty';
  if (n.includes('roll') || n.includes('cap') || n.includes('ring')) return 'Kids Special';
  return 'General';
}

// Normalize unit to one of 'box', 'packet', 'piece'
export function normalizeUnit(val) {
  const u = String(val || '').toLowerCase().trim();
  if (u.includes('pkt') || u.includes('packet')) return 'packet';
  if (u.includes('piece') || u.includes('pc') || u.includes('nos')) return 'piece';
  return 'box';
}

// ----------------------------------------------------
// TABULAR DATA PARSER (Excel, CSV, Word Tables, Structured PDF)
// ----------------------------------------------------
export function parseTableData(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];

  // Filter out completely empty rows
  const cleanRows = rawRows
    .map(row => (Array.isArray(row) ? row.map(c => String(c ?? '').trim()) : []))
    .filter(row => row.some(c => c.length > 0));

  if (cleanRows.length === 0) return [];

  // Step 1: Detect Header Row
  let headerRowIndex = -1;
  let nameIdx = -1;
  let qtyIdx = -1;
  let priceIdx = -1;
  let unitIdx = -1;
  let catIdx = -1;

  // Search first 6 rows for header keywords
  const maxSearchRows = Math.min(6, cleanRows.length);
  for (let r = 0; r < maxSearchRows; r++) {
    const row = cleanRows[r];
    const cleanedCols = row.map(cleanHeader);

    let foundName = -1;
    let foundQty = -1;
    let foundPrice = -1;
    let foundUnit = -1;
    let foundCat = -1;

    cleanedCols.forEach((col, idx) => {
      if (!col) return;
      if (foundName === -1 && NAME_KEYWORDS.some(k => col.includes(k))) foundName = idx;
      if (foundQty === -1 && QTY_KEYWORDS.some(k => col.includes(k))) foundQty = idx;
      if (foundPrice === -1 && PRICE_KEYWORDS.some(k => col.includes(k))) foundPrice = idx;
      if (foundUnit === -1 && UNIT_KEYWORDS.some(k => col.includes(k))) foundUnit = idx;
      if (foundCat === -1 && CATEGORY_KEYWORDS.some(k => col.includes(k))) foundCat = idx;
    });

    // If at least two key columns (name + qty or name + price) are matched
    if (foundName !== -1 && (foundQty !== -1 || foundPrice !== -1)) {
      headerRowIndex = r;
      nameIdx = foundName;
      qtyIdx = foundQty;
      priceIdx = foundPrice;
      unitIdx = foundUnit;
      catIdx = foundCat;
      break;
    }
  }

  // Step 2: Content-based detection if headers were not explicitly found
  if (headerRowIndex === -1) {
    const numCols = Math.max(...cleanRows.map(r => r.length));
    const sampleRows = cleanRows.slice(0, 15);

    const colStats = [];
    for (let c = 0; c < numCols; c++) {
      let textCount = 0;
      let integerCount = 0;
      let floatOrCurrencyCount = 0;
      let totalNonEmpty = 0;

      sampleRows.forEach(row => {
        const val = row[c] || '';
        if (!val) return;
        totalNonEmpty++;

        const numVal = parseFloat(val.replace(/[^0-9.]/g, ''));
        const isNum = !isNaN(numVal) && isFinite(numVal);

        if (isNum) {
          if (Number.isInteger(numVal) && numVal >= 0 && numVal <= 10000 && !val.includes('.') && !/[₹$]/.test(val)) {
            integerCount++;
          } else {
            floatOrCurrencyCount++;
          }
        } else if (/[a-zA-Z]/.test(val) && val.length > 2) {
          textCount++;
        }
      });

      colStats.push({ col: c, textCount, integerCount, floatOrCurrencyCount, totalNonEmpty });
    }

    // Name column: column with most alphabetic text
    const textCols = [...colStats].sort((a, b) => b.textCount - a.textCount);
    if (textCols.length > 0 && textCols[0].textCount > 0) {
      nameIdx = textCols[0].col;
    } else {
      nameIdx = 0;
    }

    // Numeric columns candidate
    const numericCols = colStats
      .filter(s => s.col !== nameIdx && (s.integerCount + s.floatOrCurrencyCount > 0))
      .sort((a, b) => (b.integerCount + b.floatOrCurrencyCount) - (a.integerCount + a.floatOrCurrencyCount));

    if (numericCols.length === 1) {
      // If only 1 number column, could be quantity or price
      qtyIdx = numericCols[0].col;
    } else if (numericCols.length >= 2) {
      // Pick integers as qty, decimals or currency as price
      const colA = numericCols[0];
      const colB = numericCols[1];

      if (colA.integerCount >= colB.integerCount && colB.floatOrCurrencyCount >= colA.floatOrCurrencyCount) {
        qtyIdx = colA.col;
        priceIdx = colB.col;
      } else {
        qtyIdx = colB.col;
        priceIdx = colA.col;
      }
    }
  }

  // Step 3: Extract Items
  const items = [];
  // If headers were explicitly detected, data starts at headerRowIndex + 1; otherwise starts at 0
  const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

  for (let r = startRow; r < cleanRows.length; r++) {
    const row = cleanRows[r];
    if (!row || !row[nameIdx]) continue;

    const rawName = String(row[nameIdx]).trim();
    // Skip if looks like a subtotal, total, or header duplicate
    if (!rawName || /^(total|grand total|subtotal|sl\.?no|s\.no|item name)$/i.test(rawName)) {
      continue;
    }

    // Extract quantity
    let rawQty = qtyIdx !== -1 ? row[qtyIdx] : '';
    let parsedQty = 1;
    if (rawQty) {
      const numOnly = parseInt(String(rawQty).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(numOnly)) parsedQty = numOnly;
    }

    // Extract price
    let rawPrice = priceIdx !== -1 ? row[priceIdx] : '';
    let parsedPrice = 0;
    if (rawPrice) {
      const numOnly = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
      if (!isNaN(numOnly)) parsedPrice = numOnly;
    }

    // Extract unit
    const rawUnit = unitIdx !== -1 && row[unitIdx] ? row[unitIdx] : 'box';
    const unit = normalizeUnit(rawUnit);

    // Extract category
    const rawCat = catIdx !== -1 && row[catIdx] ? String(row[catIdx]).trim() : '';
    const category = rawCat || guessCategory(rawName);

    items.push({
      name: rawName,
      quantity: parsedQty,
      price: parsedPrice,
      unit,
      category
    });
  }

  return items;
}

// ----------------------------------------------------
// 1. EXCEL (.xlsx, .xls) & CSV PARSER
// ----------------------------------------------------
export async function parseExcelOrCsv(file) {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('No sheets found in spreadsheet file.');

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const items = parseTableData(rawRows);
  if (items.length === 0) {
    throw new Error('No cracker records could be identified in this spreadsheet.');
  }
  return items;
}

// ----------------------------------------------------
// 2. WORD (.docx) PARSER
// ----------------------------------------------------
export async function parseWordDocument(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Try extracting HTML tables first
  try {
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    const html = htmlResult?.value || '';

    if (html && typeof document !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const tableRows = doc.querySelectorAll('table tr');

      if (tableRows && tableRows.length >= 2) {
        const rawRows = [];
        tableRows.forEach(tr => {
          const cells = Array.from(tr.querySelectorAll('td, th')).map(c => c.textContent.trim());
          if (cells.some(c => c.length > 0)) {
            rawRows.push(cells);
          }
        });

        const tableItems = parseTableData(rawRows);
        if (tableItems.length > 0) {
          return { items: tableItems, parsedLocally: true };
        }
      }
    }
  } catch (err) {
    console.warn('Word HTML table extraction failed, falling back to raw text:', err);
  }

  // Extract raw text
  const textResult = await mammoth.extractRawText({ arrayBuffer });
  const rawText = textResult?.value || '';

  if (!rawText.trim()) {
    throw new Error('Could not extract any readable text from this Word document.');
  }

  // Check if text has clean line-based structure
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    // Check for delimiter like tab, pipe, or comma
    const hasTabs = lines.some(l => l.includes('\t'));
    const hasPipes = lines.some(l => l.includes('|'));
    const hasCommas = lines.some(l => l.includes(','));

    if (hasTabs || hasPipes || (hasCommas && lines.length > 3)) {
      const sep = hasTabs ? '\t' : hasPipes ? '|' : ',';
      const rawRows = lines.map(l => l.split(sep).map(c => c.trim()));
      const items = parseTableData(rawRows);
      if (items.length > 0) {
        return { items, parsedLocally: true };
      }
    }
  }

  // If text is unstructured or narrative, send to Edge Function for Gemini
  return {
    needsAI: true,
    text: rawText,
    fileName: file.name
  };
}

// ----------------------------------------------------
// 3. TEXT PDF & SCANNED PDF PARSER (pdf.js)
// ----------------------------------------------------
export async function parsePdfDocument(file) {
  const arrayBuffer = await file.arrayBuffer();

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    const allRows = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items || [];

      if (items.length === 0) continue;

      // Group text items by line (using vertical coordinate Y with 4px tolerance)
      const lineMap = new Map();
      items.forEach(item => {
        if (!item.str || !item.str.trim()) return;
        const y = Math.round((item.transform[5] || 0) / 4) * 4;
        const x = item.transform[4] || 0;

        if (!lineMap.has(y)) {
          lineMap.set(y, []);
        }
        lineMap.get(y).push({ x, text: item.str });
      });

      // Sort lines top-to-bottom (PDF Y coordinate is from bottom, so higher Y is higher on page)
      const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);

      sortedY.forEach(y => {
        const lineItems = lineMap.get(y);
        // Sort items left-to-right
        lineItems.sort((a, b) => a.x - b.x);
        const lineText = lineItems.map(i => i.text.trim()).join(' ').trim();
        if (lineText) {
          fullText += lineText + '\n';
          allRows.push(lineItems.map(i => i.text.trim()));
        }
      });
    }

    // Check if PDF has readable text or is scanned
    const cleanAlpha = fullText.replace(/[^a-zA-Z]/g, '');
    if (cleanAlpha.length < 25) {
      // Scanned PDF! Requires Gemini Multimodal OCR
      return {
        needsAI: true,
        isScannedPdf: true,
        fileName: file.name
      };
    }

    // Try parsing structured tabular text
    if (allRows.length >= 2) {
      const parsedItems = parseTableData(allRows);
      if (parsedItems.length >= 1) {
        return { items: parsedItems, parsedLocally: true };
      }
    }

    // If PDF text is readable but tabular layout is irregular, send extracted text to Edge Function
    return {
      needsAI: true,
      text: fullText,
      fileName: file.name
    };
  } catch (err) {
    console.warn('pdf.js extraction error, falling back to Gemini multimodal:', err);
    return {
      needsAI: true,
      isScannedPdf: true,
      fileName: file.name
    };
  }
}

// ----------------------------------------------------
// 4. PLAIN TEXT (.txt) PARSER
// ----------------------------------------------------
export async function parsePlainText(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    throw new Error('Text file is empty.');
  }

  // Check for CSV / tab / pipe delimiters
  const hasTabs = lines.some(l => l.includes('\t'));
  const hasPipes = lines.some(l => l.includes('|'));
  const hasCommas = lines.some(l => l.includes(','));

  if (hasTabs || hasPipes || hasCommas) {
    const sep = hasTabs ? '\t' : hasPipes ? '|' : ',';
    const rawRows = lines.map(l => l.split(sep).map(c => c.trim()));
    const items = parseTableData(rawRows);
    if (items.length > 0) {
      return { items, parsedLocally: true };
    }
  }

  // Regex pattern matching: "Name - Qty - Price" or "Qty x Name @ Price"
  const regexItems = [];
  const patternDash = /^(.+?)\s*[-:]\s*(\d+)\s*(?:boxes|box|packets|pkts|pcs|pieces)?\s*[-:]\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i;
  const patternX = /^(\d+)\s*(?:x|nos)?\s+(.+?)\s+[@at]\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)$/i;

  for (const line of lines) {
    const match1 = line.match(patternDash);
    if (match1) {
      regexItems.push({
        name: match1[1].trim(),
        quantity: parseInt(match1[2], 10) || 1,
        price: parseFloat(match1[3]) || 0,
        unit: 'box',
        category: guessCategory(match1[1])
      });
      continue;
    }

    const match2 = line.match(patternX);
    if (match2) {
      regexItems.push({
        name: match2[2].trim(),
        quantity: parseInt(match2[1], 10) || 1,
        price: parseFloat(match2[3]) || 0,
        unit: 'box',
        category: guessCategory(match2[2])
      });
      continue;
    }
  }

  if (regexItems.length > 0) {
    return { items: regexItems, parsedLocally: true };
  }

  // If unstructured, send text to Edge Function
  return {
    needsAI: true,
    text,
    fileName: file.name
  };
}

// ----------------------------------------------------
// 5. HELPER: CONVERT FILE TO BASE64 DATA URL
// ----------------------------------------------------
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64Data = result.split(',')[1] || '';
        resolve(base64Data);
      } else {
        reject(new Error('Failed to convert file to base64.'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ----------------------------------------------------
// 6. GEMINI CALL WITH AUTOMATIC RETRY & FRIENDLY ERRORS
// ----------------------------------------------------
export async function invokeGeminiParserWithRetry({ text, fileBase64, mimeType, fileName, onProgress }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please check your environment variables.');
  }

  async function callFunction() {
    const { data, error } = await supabase.functions.invoke('parse-stock-list', {
      body: {
        text,
        fileBase64,
        fileData: fileBase64,
        mimeType,
        fileName
      }
    });

    if (error) {
      let realErrMsg = error.message;
      let status = error.status || 500;
      if (error.context) {
        try {
          const errJson = await error.context.json();
          if (errJson?.error) realErrMsg = errJson.error;
          if (errJson?.status) status = errJson.status;
        } catch {
          try {
            const txt = await error.context.text();
            if (txt) realErrMsg = txt;
          } catch {}
        }
      }
      const err = new Error(realErrMsg);
      err.status = status;
      err.rawDetails = realErrMsg;
      throw err;
    }

    if (!data?.items || !Array.isArray(data.items)) {
      throw new Error('Gemini returned an invalid response structure.');
    }

    return data.items;
  }

  try {
    return await callFunction();
  } catch (firstErr) {
    const isRetryable = (
      firstErr.status === 429 ||
      firstErr.status === 503 ||
      firstErr.status === 504 ||
      /busy|503|429|timeout|overloaded|resource exhausted|temporarily unavailable/i.test(firstErr.message || '')
    );

    if (isRetryable) {
      if (onProgress) onProgress('AI service was temporarily busy. Retrying automatically in 3 seconds...');
      await new Promise(res => setTimeout(res, 3000));
      if (onProgress) onProgress('Reading your file...');
      try {
        return await callFunction();
      } catch (secondErr) {
        secondErr.isAiBusy = true;
        secondErr.friendlyMessage = 'The AI service is temporarily busy. Please click "Try again" or upload an Excel, CSV, or Word file.';
        secondErr.rawDetails = secondErr.message;
        throw secondErr;
      }
    }

    throw firstErr;
  }
}

