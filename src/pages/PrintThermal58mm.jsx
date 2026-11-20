import React, { useEffect, useRef, useState } from 'react';

export default function PrintThermal58mm({ bill, onBack }) {
  const receiptRef = useRef(null);
  const [thresholdedLogo, setThresholdedLogo] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Convert the color logo into a high-contrast pure black and white (1-bit thresholded) bitmap
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/logo.jpg';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 384; // 384 dots (48mm printable width at 203 DPI)
        const scale = 384 / img.width;
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        // Apply strict threshold (no gray)
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          // Standard luminance
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const val = gray < 160 ? 0 : 255;
          d[i] = val;
          d[i + 1] = val;
          d[i + 2] = val;
        }

        ctx.putImageData(imgData, 0, 0);
        setThresholdedLogo(canvas.toDataURL('image/png'));
      } catch (e) {
        console.warn('Canvas threshold error:', e);
      }
    };
  }, []);

  if (!bill) return null;

  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(bill.bill_date || Date.now()));

  // -------------------------------------------------------------
  // RAWBT AND ESC/POS TEXT GENERATION FOR ANDROID BLUETOOTH
  // -------------------------------------------------------------
  function generateEscPosText() {
    let t = '';
    t += '================================\n';
    t += '  SRI SENTHUR PATTASU KADAI\n';
    t += ' Palaiyathar Thottam, Gandhi Nagar\n';
    t += ' Thachur, Kallakurichi - 606213\n';
    t += ' Ph: 9940470552, 9952531682\n';
    t += '     9578090638\n';
    t += '--------------------------------\n';
    t += `Bill: ${bill.bill_number}\n`;
    t += `Date: ${formattedDate}\n`;
    t += `Cust: ${bill.customer_name}\n`;
    if (bill.place) t += `Place: ${bill.place}\n`;
    t += '--------------------------------\n';
    t += 'Item              Rate Qty Total\n';
    t += '--------------------------------\n';

    (bill.items || []).forEach((item, idx) => {
      const name = `${idx + 1}. ${item.product_name || item.name}`;
      t += `${name}\n`;
      const rate = String(item.rate).padStart(6, ' ');
      const qty = String(item.quantity || item.qty).padStart(4, ' ');
      const total = String(item.total || (item.rate * (item.quantity || item.qty))).padStart(8, ' ');
      t += `${rate} x ${qty} = ₹${total}\n`;
    });

    t += '--------------------------------\n';
    t += `SUBTOTAL:           ₹${bill.subtotal}\n`;
    if (bill.discount_percent > 0) {
      t += `DISCOUNT (${bill.discount_percent}%):    - ₹${bill.discount_amount}\n`;
    }
    t += `FINAL BILL:         ₹${bill.final_total}\n`;
    t += '--------------------------------\n';
    t += '   Nandri! Meendum Varuga!\n';
    t += '================================\n\n\n\n';
    return t;
  }

  function handleRawBtPrint() {
    const rawText = generateEscPosText();
    // RawBT intent URL for Android Bluetooth
    const base64Data = btoa(unescape(encodeURIComponent(rawText)));
    window.location.href = `rawbt:data:base64,${base64Data}`;
  }

  function handleBrowserPrint() {
    window.print();
  }

  async function handleShareOrCopy() {
    const rawText = generateEscPosText();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Receipt ${bill.bill_number}`,
          text: rawText
        });
        return;
      } catch {}
    }

    // Fallback copy to clipboard
    try {
      await navigator.clipboard.writeText(rawText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {}
  }

  return (
    <div className="min-h-screen bg-light-surface p-4 flex flex-col items-center gap-4">
      {/* Top Action Bar (Hidden when printed) */}
      <div className="w-full max-w-sm flex items-center justify-between no-print">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-md bg-white border border-gold-border font-label text-xs font-bold text-deep-green hover:bg-gold-soft shadow-xs"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Back</span>
        </button>

        <span className="font-label text-xs font-bold text-deep-green">
          58mm Thermal Preview
        </span>

        <button
          type="button"
          onClick={handleBrowserPrint}
          className="inline-flex items-center gap-1 min-h-[40px] px-4 rounded-md bg-bright-red text-white font-label text-xs font-bold hover:opacity-90 shadow-md"
        >
          <span className="material-symbols-outlined text-[16px]">print</span>
          <span>Print</span>
        </button>
      </div>

      {/* Android / iPhone Guidance Card (Hidden when printed) */}
      <div className="w-full max-w-sm bg-light-surface-container-low border border-gold-border rounded-lg p-3 text-xs flex flex-col gap-2 no-print shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-label font-bold text-deep-green">Quick Bluetooth / USB Print:</span>
          <span className="font-mono text-[10px] text-light-on-surface-variant">Posiflow PSF20</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleRawBtPrint}
            className="px-3 py-2 rounded bg-deep-green text-white font-label text-xs font-bold hover:opacity-90 flex items-center justify-center gap-1.5 shadow-xs"
            title="Open in RawBT Bluetooth Print App on Android"
          >
            <span className="material-symbols-outlined text-[16px]">bluetooth</span>
            <span>Android RawBT</span>
          </button>

          <button
            type="button"
            onClick={handleShareOrCopy}
            className="px-3 py-2 rounded bg-peacock-blue text-white font-label text-xs font-bold hover:opacity-90 flex items-center justify-center gap-1.5 shadow-xs"
            title="Share or Copy Receipt Text"
          >
            <span className="material-symbols-outlined text-[16px]">share</span>
            <span>{copySuccess ? 'Copied!' : 'Share / Copy'}</span>
          </button>
        </div>

        <p className="text-[11px] text-light-on-surface-variant leading-tight mt-1 border-t border-light-outline-variant pt-1.5">
          <strong>Note for iPhone:</strong> Safari on iOS does not support direct Bluetooth printing without vendor MFi apps. Use <em>"Print"</em> (AirPrint / Printer share) or <em>"Share / Copy"</em> to send receipt image/text.
        </p>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 58MM THERMAL RECEIPT CONTAINER */}
      {/* Pure black on pure white, 48mm printable width, stacked 2 lines */}
      {/* ------------------------------------------------------------- */}
      <div className="w-full flex justify-center py-2">
        <article
          ref={receiptRef}
          className="thermal-receipt-page w-[48mm] max-w-[48mm] bg-white text-black font-mono p-1 border-2 border-black print:border-none shadow-md print:shadow-none"
          style={{
            backgroundColor: '#FFFFFF',
            color: '#000000',
            fontFamily: '"Source Code Pro", monospace',
            width: '48mm',
            boxSizing: 'border-box',
            lineHeight: 1.2
          }}
        >
          {/* Thresholded 1-bit Black & White Logo (No grays) */}
          <div className="flex justify-center pb-1">
            <img
              src={thresholdedLogo || '/logo.jpg'}
              alt="Shop Logo"
              className="w-full h-auto object-contain max-h-16"
              style={{
                filter: thresholdedLogo ? 'none' : 'grayscale(100%) contrast(1000%) brightness(120%)',
                imageRendering: 'pixelated'
              }}
            />
          </div>

          {/* Shop Address & Phone Numbers */}
          <div className="text-center font-bold text-[9pt] leading-tight pb-1 font-tamil">
            <p>பாளையத்தார் தோட்டம், காந்தி நகர்,</p>
            <p>தச்சூர், கள்ளக்குறிச்சி - 606213</p>
            <p className="font-mono text-[8pt] mt-0.5 font-bold">
              Ph: 9940470552, 9952531682, 9578090638
            </p>
          </div>

          {/* Dashed divider */}
          <div className="border-t border-dashed border-black my-1" />

          {/* Customer & Bill Metadata */}
          <div className="text-[8.5pt] leading-tight">
            <p className="flex justify-between">
              <span>Bill:</span>
              <strong className="font-bold">{bill.bill_number}</strong>
            </p>
            <p className="flex justify-between">
              <span>Date:</span>
              <span>{formattedDate}</span>
            </p>
            <p className="flex justify-between">
              <span>Cust:</span>
              <strong className="font-bold truncate max-w-[32mm]">{bill.customer_name}</strong>
            </p>
            {bill.place && (
              <p className="flex justify-between">
                <span>Place:</span>
                <span className="truncate max-w-[32mm]">{bill.place}</span>
              </p>
            )}
          </div>

          {/* Dashed divider */}
          <div className="border-t border-dashed border-black my-1" />

          {/* Column Header */}
          <div className="text-[8pt] font-bold pb-0.5 flex justify-between">
            <span>Item</span>
            <span>Rate | Qty | Total</span>
          </div>

          <div className="border-t border-dashed border-black my-0.5" />

          {/* Stacked 2-Line Item Layout */}
          {/* Line 1 (full width, bold): item S.No and item name */}
          {/* Line 2 (three columns): Rate | Qty | Total */}
          <div className="flex flex-col gap-1.5 py-1 text-[8.5pt] tabular-nums">
            {(bill.items || []).map((item, idx) => {
              const itemTotal = item.total || (item.rate * (item.quantity || item.qty));
              return (
                <div key={idx} className="flex flex-col">
                  {/* Line 1: S.No + Name (bold, full width) */}
                  <p className="font-bold text-[9pt] leading-tight break-words">
                    {idx + 1}. {item.product_name || item.name}
                  </p>
                  {/* Line 2: Rate | Qty | Total (3 columns) */}
                  <div className="flex justify-between text-[8.5pt] font-semibold pl-2">
                    <span>₹{item.rate}</span>
                    <span>x {item.quantity || item.qty}</span>
                    <strong className="font-bold">₹{itemTotal}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dashed divider */}
          <div className="border-t border-dashed border-black my-1" />

          {/* Bold Summary Block */}
          <div className="flex flex-col gap-0.5 text-[8.5pt] font-bold tabular-nums">
            <div className="flex justify-between">
              <span>SUBTOTAL:</span>
              <span>₹{parseFloat(bill.subtotal).toFixed(2)}</span>
            </div>
            {bill.discount_percent > 0 && (
              <div className="flex justify-between">
                <span>DISCOUNT ({bill.discount_percent}%):</span>
                <span>- ₹{parseFloat(bill.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-dashed border-black pt-1 mt-0.5 flex justify-between text-[10pt] font-extrabold">
              <span>FINAL BILL:</span>
              <span>₹{parseFloat(bill.final_total).toFixed(2)}</span>
            </div>
          </div>

          {/* Dashed divider */}
          <div className="border-t border-dashed border-black my-1" />

          {/* Tamil Footer */}
          <div className="text-center font-tamil text-[9pt] font-bold pt-1 pb-1">
            <p>நன்றி! மீண்டும் வருக!</p>
          </div>
        </article>
      </div>
    </div>
  );
}
