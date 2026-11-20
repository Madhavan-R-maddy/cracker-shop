import React from 'react';

export default function BottomNav({ activePage, setActivePage }) {
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: 'dashboard' },
    { id: 'billing', label: 'Billing', icon: 'point_of_sale', isPrimary: true },
    { id: 'stock', label: 'Stock', icon: 'inventory_2' },
    { id: 'bills', label: 'Bills', icon: 'receipt' },
    { id: 'settings', label: 'More', icon: 'menu' },
  ];

  return (
    <nav 
      aria-label="Mobile Navigation" 
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-deep-green text-on-deep-green border-t-2 border-gold-border flex items-center justify-around px-1 py-1 shadow-2xl no-print"
    >
      {navItems.map((item) => {
        const isActive = activePage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            className={`flex flex-col items-center justify-center min-h-[52px] px-3 py-1 rounded-md transition-colors ${
              isActive
                ? 'bg-gold text-on-gold font-bold'
                : 'text-on-deep-green/90 hover:text-white'
            }`}
          >
            <span className={`material-symbols-outlined text-[22px] ${isActive ? 'fill' : ''}`}>
              {item.icon}
            </span>
            <span className="font-label text-[11px] tracking-tight mt-0.5">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
