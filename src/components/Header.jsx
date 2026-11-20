import React from 'react';

export default function Header({ 
  activePage, 
  setActivePage, 
  onOpenCustomerAsked, 
  onLockSession, 
  productsCount = 0 
}) {
  const todayFormatted = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  return (
    <header className="bg-deep-green text-on-deep-green border-b-2 border-gold-border px-4 md:px-6 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-30 shadow-md">
      {/* Compulsory Large Brand Logo (No shop name text) */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setActivePage('dashboard')}
          className="h-14 md:h-16 w-auto rounded-md border border-gold-border bg-light-surface-container-lowest p-1 flex items-center justify-center overflow-hidden hover:opacity-95 transition-opacity"
          title="Home Dashboard"
        >
          <img 
            src="/logo.jpg" 
            alt="Brand Logo" 
            className="h-full w-auto object-contain max-h-14 md:max-h-16"
          />
        </button>

        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-light-primary-container text-deep-green font-label text-xs font-semibold">
          <span className="material-symbols-outlined text-gold text-[16px]">auto_awesome</span>
          <span>{todayFormatted}</span>
          <span className="text-light-on-surface-variant/60">•</span>
          <span>{productsCount} Items</span>
        </div>
      </div>

      {/* Header Quick Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCustomerAsked}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-md bg-gold-soft text-deep-green border border-gold-border font-label text-xs sm:text-sm font-bold hover:bg-gold hover:text-on-gold transition-colors active:scale-95 shadow-sm"
          title="Record out-of-stock cracker requested by customer"
        >
          <span className="material-symbols-outlined text-[18px]">add_comment</span>
          <span className="whitespace-nowrap">Customer asked for</span>
        </button>

        {activePage !== 'billing' ? (
          <button
            type="button"
            onClick={() => setActivePage('billing')}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-md bg-gold text-on-gold border border-gold-border font-label text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity active:scale-95 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
            <span className="hidden sm:inline">New Bill</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onLockSession}
          title="Lock App PIN"
          className="w-10 h-10 rounded-md bg-deep-green text-gold-soft border border-gold/40 inline-flex items-center justify-center hover:bg-light-primary-container hover:text-deep-green transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">lock</span>
        </button>
      </div>
    </header>
  );
}
