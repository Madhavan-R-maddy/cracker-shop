import React, { useEffect } from 'react';

export default function PrintA4({ bill, onBack }) {
  useEffect(() => {
    // Auto-trigger browser print dialog after render
    const timer = setTimeout(() => {
      window.print();
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  if (!bill) return null;

  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(bill.bill_date || Date.now()));

  return (
    <div className="min-h-screen bg-light-surface p-4 flex flex-col items-center gap-4 print:p-0 print:m-0 print:gap-0 print:bg-white print:min-h-0">
      {/* Top Action Bar (Hidden when printed) */}
      <div className="w-full max-w-[794px] flex items-center justify-between no-print">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-md bg-white border border-gold-border font-label text-xs sm:text-sm font-bold text-deep-green hover:bg-gold-soft shadow-xs"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          <span>Back to Billing</span>
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 min-h-[42px] px-5 rounded-md bg-bright-red text-white font-label text-xs sm:text-sm font-bold hover:opacity-90 shadow-md"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          <span>Print A4 Bill</span>
        </button>
      </div>

      {/* A4 Sheet (Standard 210mm x 297mm proportions) */}
      <article className="w-full max-w-[794px] bg-white border-2 border-gold-border rounded-lg p-6 sm:p-8 shadow-lg flex flex-col gap-5 text-black print:border-none print:p-0 print:shadow-none print:w-full">
        
        {/* Header: Compulsory Large Logo at top (NO shop name as text) + Address & Phone */}
        <header className="flex flex-col items-center text-center border-b-2 border-gold-border pb-4 gap-2">
          <div className="h-24 sm:h-28 w-auto">
            <img 
              src="/logo.jpg" 
              alt="Shop Logo" 
              className="h-full w-auto object-contain mx-auto"
            />
          </div>

          <div className="font-tamil text-xs sm:text-sm text-black leading-relaxed font-semibold">
            <p>பாளையத்தார் தோட்டம், காந்தி நகர், தச்சூர், கள்ளக்குறிச்சி - 606213</p>
          </div>

          <p className="font-mono text-xs sm:text-sm font-bold text-deep-green tracking-wide">
            <span>Ph: </span>9940470552, 9952531682, 9578090638
          </p>
        </header>

        {/* Bill Info Grid */}
        <section className="grid grid-cols-2 gap-4 bg-light-surface-container-low/60 border border-light-outline-variant rounded-md p-3.5 text-xs sm:text-sm">
          <div className="flex flex-col gap-1">
            <p>
              <span className="font-label text-light-on-surface-variant font-semibold">Customer: </span>
              <strong className="font-title font-bold text-black">{bill.customer_name}</strong>
            </p>
            {bill.place && (
              <p>
                <span className="font-label text-light-on-surface-variant font-semibold">Place: </span>
                <span className="font-body text-black">{bill.place}</span>
              </p>
            )}
          </div>
          <div className="text-right flex flex-col gap-1 tabular-nums font-mono">
            <p>
              <span className="font-label text-light-on-surface-variant font-semibold font-body">Bill No: </span>
              <strong className="text-deep-green font-bold">{bill.bill_number}</strong>
            </p>
            <p>
              <span className="font-label text-light-on-surface-variant font-semibold font-body">Date: </span>
              <span className="text-black">{formattedDate}</span>
            </p>
          </div>
        </section>

        {/* Items Table */}
        <table className="w-full text-left border-collapse border border-gold-border text-xs sm:text-sm">
          <thead className="bg-deep-green text-white">
            <tr>
              <th className="px-3 py-2.5 w-12 font-label font-bold text-center">S.No</th>
              <th className="px-3 py-2.5 font-label font-bold">Item Description</th>
              <th className="px-3 py-2.5 text-right w-24 font-label font-bold">Rate</th>
              <th className="px-3 py-2.5 text-right w-20 font-label font-bold">Qty</th>
              <th className="px-3 py-2.5 text-right w-28 font-label font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-light-outline-variant tabular-nums">
            {(bill.items || []).map((item, idx) => (
              <tr key={idx} className="hover:bg-gold-soft/20">
                <td className="px-3 py-2 text-center font-mono text-light-on-surface-variant">
                  {idx + 1}
                </td>
                <td className="px-3 py-2 font-title font-bold text-black">
                  {item.product_name || item.name}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  ₹{parseFloat(item.rate).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {item.quantity || item.qty}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-deep-green">
                  ₹{parseFloat(item.total || (item.rate * (item.quantity || item.qty))).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary Totals */}
        <section className="flex justify-end pt-2">
          <div className="w-full max-w-xs flex flex-col gap-1.5 tabular-nums text-xs sm:text-sm">
            <div className="flex justify-between">
              <span className="font-body text-light-on-surface-variant">Subtotal:</span>
              <span className="font-mono font-bold">₹{parseFloat(bill.subtotal).toFixed(2)}</span>
            </div>
            {bill.discount_percent > 0 && (
              <div className="flex justify-between text-bright-red">
                <span className="font-body">Discount ({bill.discount_percent}%):</span>
                <span className="font-mono font-bold">- ₹{parseFloat(bill.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t-2 border-gold-border pt-2 flex justify-between items-center">
              <span className="font-headline text-base font-extrabold text-deep-green">
                FINAL BILL:
              </span>
              <span className="font-headline text-xl font-extrabold text-deep-green font-mono">
                ₹{parseFloat(bill.final_total).toFixed(2)}
              </span>
            </div>
          </div>
        </section>

        {/* Tamil Footer */}
        <footer className="border-t border-gold-border pt-4 text-center mt-auto">
          <p className="font-tamil text-base font-bold text-deep-green tracking-wide">
            நன்றி! மீண்டும் வருக!
          </p>
        </footer>
      </article>
    </div>
  );
}
