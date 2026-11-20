import React, { useMemo } from 'react';

export default function Dashboard({ 
  products = [], 
  bills = [], 
  setActivePage 
}) {
  // 1. Today's Sales Calculation
  const todayStats = useMemo(() => {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    const todayBills = bills.filter(b => {
      const d = new Date(b.bill_date);
      return (
        d.getFullYear() === todayYear &&
        d.getMonth() === todayMonth &&
        d.getDate() === todayDate
      );
    });

    const totalSales = todayBills.reduce((acc, b) => acc + (parseFloat(b.final_total) || 0), 0);
    return {
      count: todayBills.length,
      total: totalSales
    };
  }, [bills]);

  // 2. Stock Health
  const stockStats = useMemo(() => {
    const totalItems = products.length;
    const totalUnits = products.reduce((acc, p) => acc + (parseInt(p.quantity, 10) || 0), 0);
    const lowStockItems = products.filter(p => (parseInt(p.quantity, 10) || 0) <= (parseInt(p.low_stock_level, 10) || 10));
    return {
      totalItems,
      totalUnits,
      lowStockItems,
      lowStockCount: lowStockItems.length
    };
  }, [products]);

  // 3. 7-Day Sales Trend
  const sevenDaySales = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayLabel = i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      
      const dayBills = bills.filter(b => {
        const bd = new Date(b.bill_date);
        return (
          bd.getFullYear() === d.getFullYear() &&
          bd.getMonth() === d.getMonth() &&
          bd.getDate() === d.getDate()
        );
      });

      const dayTotal = dayBills.reduce((acc, b) => acc + (parseFloat(b.final_total) || 0), 0);
      days.push({
        label: dayLabel,
        total: dayTotal,
        isToday: i === 0
      });
    }

    const maxTotal = Math.max(...days.map(d => d.total), 1000);
    const total7Days = days.reduce((acc, d) => acc + d.total, 0);

    return {
      days,
      maxTotal,
      total7Days
    };
  }, [bills]);

  // 4. Top Selling Crackers Calculation
  const topSelling = useMemo(() => {
    const itemMap = {};
    bills.forEach(bill => {
      (bill.items || []).forEach(item => {
        const name = item.product_name;
        if (!itemMap[name]) {
          itemMap[name] = { name, qty: 0, revenue: 0 };
        }
        itemMap[name].qty += (parseInt(item.quantity, 10) || 0);
        itemMap[name].revenue += (parseFloat(item.total) || (item.rate * item.quantity) || 0);
      });
    });

    const sorted = Object.values(itemMap).sort((a, b) => b.qty - a.qty);
    return sorted.slice(0, 5);
  }, [bills]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Page Title & Subtitle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-light-on-surface">
            Dashboard
          </h1>
          <span className="material-symbols-outlined text-gold text-[22px]">auto_awesome</span>
        </div>
        <p className="font-body text-xs md:text-sm text-light-on-surface-variant">
          Daily counter summary & stock health
        </p>
      </div>

      {/* 3 Main KPI Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Today's Sales */}
        <article className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col justify-between gap-3">
          <header className="flex items-center justify-between">
            <h2 className="font-title text-sm font-semibold text-light-on-surface-variant">
              Today's Sales
            </h2>
            <span className="w-10 h-10 rounded-full bg-gold-soft text-deep-green inline-flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">payments</span>
            </span>
          </header>
          <div className="flex flex-col">
            <p className="font-headline text-2xl md:text-3xl font-bold text-deep-green tabular-nums">
              ₹{todayStats.total.toLocaleString('en-IN')}
            </p>
            <p className="font-body text-xs text-light-on-surface-variant mt-0.5">
              {todayStats.count} bills completed today
            </p>
          </div>
        </article>

        {/* Card 2: Total Stock Items */}
        <article className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col justify-between gap-3">
          <header className="flex items-center justify-between">
            <h2 className="font-title text-sm font-semibold text-light-on-surface-variant">
              Total Stock Items
            </h2>
            <span className="w-10 h-10 rounded-full bg-peacock-soft text-peacock-blue inline-flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">inventory_2</span>
            </span>
          </header>
          <div className="flex flex-col">
            <p className="font-headline text-2xl md:text-3xl font-bold text-peacock-blue tabular-nums">
              {stockStats.totalItems} Varieties
            </p>
            <p className="font-body text-xs text-light-on-surface-variant mt-0.5">
              {stockStats.totalUnits.toLocaleString('en-IN')} total units in store
            </p>
          </div>
        </article>

        {/* Card 3: Low-Stock Alerts */}
        <article 
          onClick={() => setActivePage('stock')}
          className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col justify-between gap-3 cursor-pointer hover:border-bright-red transition-colors"
        >
          <header className="flex items-center justify-between">
            <h2 className="font-title text-sm font-semibold text-bright-red">
              Low-Stock Alerts
            </h2>
            <span className="w-10 h-10 rounded-full bg-red-soft text-bright-red inline-flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">warning</span>
            </span>
          </header>
          <div className="flex flex-col">
            <p className="font-headline text-2xl md:text-3xl font-bold text-bright-red tabular-nums">
              {stockStats.lowStockCount} Items
            </p>
            <p className="font-body text-xs text-light-on-surface-variant mt-0.5">
              {stockStats.lowStockCount > 0 ? 'Below reorder level — restock soon' : 'All cracker stock levels healthy'}
            </p>
          </div>
        </article>
      </section>

      {/* Sales Trend Chart & Top Selling Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* 7-Day Sales Trend */}
        <article className="lg:col-span-7 bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col justify-between gap-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="font-headline text-base md:text-lg font-bold text-light-on-surface">
                7-Day Sales Trend
              </h2>
              <p className="font-body text-xs text-light-on-surface-variant">
                Daily counter revenue (₹)
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-peacock-soft text-peacock-blue font-label text-xs font-bold tabular-nums">
              Total ₹{sevenDaySales.total7Days.toLocaleString('en-IN')}
            </span>
          </header>

          <div className="flex flex-col justify-end pt-3">
            <div className="grid grid-cols-7 gap-2 items-end h-48 border-b border-light-outline-variant pb-2">
              {sevenDaySales.days.map((day, idx) => {
                const heightPercent = Math.max(10, Math.min(100, Math.round((day.total / sevenDaySales.maxTotal) * 100)));
                return (
                  <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="font-mono text-[10px] sm:text-xs text-light-on-surface-variant tabular-nums font-semibold">
                      {day.total >= 1000 ? `${Math.round(day.total / 1000)}k` : day.total}
                    </span>
                    <div 
                      className={`w-full max-w-[36px] rounded-t-sm transition-all duration-300 ${
                        day.isToday 
                          ? 'bg-gold border-2 border-gold-border shadow-xs' 
                          : 'bg-peacock-blue/90 hover:bg-peacock-blue'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7 gap-2 pt-2 text-center font-label text-[11px] sm:text-xs text-light-on-surface-variant font-medium">
              {sevenDaySales.days.map((day, idx) => (
                <span key={idx} className={day.isToday ? 'text-deep-green font-bold' : ''}>
                  {day.label}
                </span>
              ))}
            </div>
          </div>
        </article>

        {/* Top Selling Crackers */}
        <article className="lg:col-span-5 bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col justify-between gap-4">
          <header className="flex items-center justify-between border-b border-light-outline-variant pb-3">
            <h2 className="font-headline text-base md:text-lg font-bold text-light-on-surface">
              Top Selling Crackers
            </h2>
            <span className="material-symbols-outlined text-gold text-[20px]">auto_awesome</span>
          </header>

          <div className="flex-1">
            {topSelling.length > 0 ? (
              <ul className="divide-y divide-light-outline-variant">
                {topSelling.map((item, idx) => (
                  <li key={idx} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-title text-sm font-bold text-light-on-surface">
                        {item.name}
                      </p>
                      <p className="font-body text-xs text-light-on-surface-variant">
                        {item.qty} units sold
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-deep-green tabular-nums">
                      ₹{item.revenue.toLocaleString('en-IN')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-10 text-center text-xs text-light-on-surface-variant flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-gold text-[36px]">receipt_long</span>
                <p>Complete bills to see fast-moving crackers ranked here.</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setActivePage('billing')}
            className="w-full inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-md bg-gold text-on-gold border border-gold-border font-label text-xs font-bold hover:opacity-90 shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
            <span>Create New Bill</span>
          </button>
        </article>
      </section>

      {/* Low Stock Quick Warning Panel if any items low */}
      {stockStats.lowStockItems.length > 0 && (
        <section className="bg-red-soft border-2 border-bright-red/30 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-bright-red text-white inline-flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">error</span>
            </span>
            <div>
              <h3 className="font-headline text-sm font-bold text-bright-red">
                {stockStats.lowStockItems.length} Cracker(s) Running Low
              </h3>
              <p className="font-body text-xs text-light-on-surface-variant">
                {stockStats.lowStockItems.map(p => `${p.name} (${p.quantity} left)`).slice(0, 3).join(', ')}
                {stockStats.lowStockItems.length > 3 ? ` and ${stockStats.lowStockItems.length - 3} more` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActivePage('stock')}
            className="px-4 py-2 rounded-md bg-bright-red text-white font-label text-xs font-bold hover:opacity-90 shadow-xs shrink-0"
          >
            View Stock & Add Units
          </button>
        </section>
      )}
    </div>
  );
}
