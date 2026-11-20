import React from 'react';

export default function PrintChoiceModal({ isOpen, onClose, bill, onSelectFormat }) {
  if (!isOpen || !bill) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-light-surface-container-lowest border-2 border-gold-border rounded-xl shadow-2xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-light-outline-variant pb-2">
          <h3 className="font-headline text-base md:text-lg font-bold text-light-on-surface">
            Choose Printer Format
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <p className="font-body text-xs text-light-on-surface-variant">
          Bill <strong className="font-mono text-deep-green">{bill.bill_number}</strong> for {bill.customer_name} (₹{bill.final_total})
        </p>

        {/* 2 Options ONLY (as specified in prompt) */}
        <div className="grid grid-cols-1 gap-2.5">
          {/* Option 1: Normal printer (A4) */}
          <button
            type="button"
            onClick={() => {
              onSelectFormat('a4', bill);
              onClose();
            }}
            className="w-full text-left bg-light-surface-container-lowest border-2 border-gold-border rounded-lg p-3.5 hover:bg-gold-soft transition-colors flex items-center gap-3.5 shadow-xs group"
          >
            <span className="w-12 h-12 rounded-lg bg-light-primary-container text-deep-green inline-flex items-center justify-center group-hover:bg-deep-green group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[26px]">description</span>
            </span>
            <div>
              <p className="font-title text-sm font-bold text-light-on-surface">
                1. Normal printer (A4)
              </p>
              <p className="font-body text-xs text-light-on-surface-variant">
                Full-page invoice with shop logo & professional item table
              </p>
            </div>
          </button>

          {/* Option 2: 58mm thermal receipt */}
          <button
            type="button"
            onClick={() => {
              onSelectFormat('thermal', bill);
              onClose();
            }}
            className="w-full text-left bg-light-surface-container-lowest border-2 border-gold-border rounded-lg p-3.5 hover:bg-gold-soft transition-colors flex items-center gap-3.5 shadow-xs group"
          >
            <span className="w-12 h-12 rounded-lg bg-light-primary-container text-deep-green inline-flex items-center justify-center group-hover:bg-deep-green group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[26px]">receipt_long</span>
            </span>
            <div>
              <p className="font-title text-sm font-bold text-light-on-surface">
                2. 58mm thermal receipt
              </p>
              <p className="font-body text-xs text-light-on-surface-variant">
                Posiflow PSF20 / Bluetooth RawBT & USB direct counter receipt
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
