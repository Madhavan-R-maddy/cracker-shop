import React from 'react';

export default function Sidebar({ activePage, setActivePage }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'billing', label: 'Billing', icon: 'point_of_sale', highlight: true },
    { id: 'stock', label: 'Stock', icon: 'inventory_2' },
    { id: 'qr-stickers', label: 'QR Stickers', icon: 'qr_code_2' },
    { id: 'bills', label: 'Bills History', icon: 'receipt' },
    { id: 'analytics', label: 'Analytics', icon: 'bar_chart' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-60 bg-deep-green text-on-deep-green border-r border-gold-border p-4 gap-1.5 shrink-0 min-h-[calc(100vh-76px)] shadow-lg">
      <nav aria-label="Main Navigation" className="flex flex-col gap-1.5">
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`flex items-center gap-3 min-h-[46px] px-3.5 py-2 rounded-md font-label text-sm transition-all duration-150 text-left ${
                isActive
                  ? 'bg-gold text-on-gold font-bold shadow-sm'
                  : 'text-on-deep-green hover:bg-light-primary-container hover:text-deep-green font-medium'
              }`}
            >
              <span className={`material-symbols-outlined text-[22px] ${isActive ? 'fill' : ''}`}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.highlight && !isActive && (
                <span className="ml-auto w-2 h-2 rounded-full bg-bright-red"></span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-gold-border/30 flex flex-col gap-2 text-xs text-gold-soft/80">
        <div className="flex items-center justify-between">
          <span>Owner Terminal</span>
          <span className="px-1.5 py-0.5 rounded bg-gold/20 text-gold text-[10px] font-mono">v1.0</span>
        </div>
        <p className="text-[11px] leading-tight text-gold-soft/60">
          Continuous sync with Supabase
        </p>
      </div>
    </aside>
  );
}
