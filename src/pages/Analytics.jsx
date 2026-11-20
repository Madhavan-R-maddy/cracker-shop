import React, { useState, useMemo } from 'react';

export default function Analytics({ 
  bills = [], 
  products = [], 
  requestedItems = [], 
  settings = {} 
}) {
  // Date range defaults: first day of current month to today
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Filter bills in selected range
  const rangeBills = useMemo(() => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return bills.filter(b => {
      const d = new Date(b.bill_date);
      return d >= start && d <= end;
    });
  }, [bills, startDate, endDate]);

  // Total sales in period
  const totalPeriodSales = useMemo(() => {
    return rangeBills.reduce((acc, b) => acc + (parseFloat(b.final_total) || 0), 0);
  }, [rangeBills]);

  // Total investment from Settings
  const totalInvestment = parseFloat(settings?.total_investment) || 150000;
  const profitSoFar = totalPeriodSales - totalInvestment;

  // Total sales grouped per date
  const salesPerDate = useMemo(() => {
    const dateMap = {};
    rangeBills.forEach(b => {
      const dateKey = new Date(b.bill_date).toISOString().slice(0, 10);
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { date: dateKey, total: 0, count: 0 };
      }
      dateMap[dateKey].total += (parseFloat(b.final_total) || 0);
      dateMap[dateKey].count += 1;
    });

    return Object.values(dateMap).sort((a, b) => b.date.localeCompare(a.date));
  }, [rangeBills]);

  // Customer List with names and amounts
  const customerList = useMemo(() => {
    const custMap = {};
    rangeBills.forEach(b => {
      const name = b.customer_name?.trim() || 'Walk-in';
      if (!custMap[name]) {
        custMap[name] = {
          name,
          place: b.place || '—',
          billsCount: 0,
          totalAmount: 0,
          lastDate: b.bill_date
        };
      }
      custMap[name].billsCount += 1;
      custMap[name].totalAmount += (parseFloat(b.final_total) || 0);
      if (new Date(b.bill_date) > new Date(custMap[name].lastDate)) {
        custMap[name].lastDate = b.bill_date;
      }
    });

    return Object.values(custMap).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [rangeBills]);

  // Fast-moving & Slow-moving crackers
  const { fastMoving, slowMoving } = useMemo(() => {
    const productSalesMap = {};
    // Seed with all current stock products
    products.forEach(p => {
      productSalesMap[p.name] = {
        name: p.name,
        category: p.category,
        qtySold: 0,
        revenue: 0,
        currentStock: p.quantity
      };
    });

    // Accumulate from range bills
    rangeBills.forEach(b => {
      (b.items || []).forEach(item => {
        const name = item.product_name || item.name;
        if (!productSalesMap[name]) {
          productSalesMap[name] = {
            name,
            category: 'Other',
            qtySold: 0,
            revenue: 0,
            currentStock: 0
          };
        }
        productSalesMap[name].qtySold += (parseInt(item.quantity, 10) || 0);
        productSalesMap[name].revenue += (parseFloat(item.total) || (item.rate * item.quantity) || 0);
      });
    });

    const allCrackerStats = Object.values(productSalesMap);
    const sortedDesc = [...allCrackerStats].sort((a, b) => b.qtySold - a.qtySold);
    const sortedAsc = [...allCrackerStats].sort((a, b) => a.qtySold - b.qtySold);

    return {
      fastMoving: sortedDesc.slice(0, 6),
      slowMoving: sortedAsc.slice(0, 6)
    };
  }, [rangeBills, products]);

  // Most requested crackers that are not stocked (from requested_items, counted)
  const mostRequested = useMemo(() => {
    const map = {};
    requestedItems.forEach(item => {
      const name = item.name?.trim();
      if (!name) return;
      if (!map[name]) {
        map[name] = { name, count: 0, lastRequested: item.requested_at };
      }
      map[name].count += 1;
      if (new Date(item.requested_at) > new Date(map[name].lastRequested)) {
        map[name].lastRequested = item.requested_at;
      }
    });

    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [requestedItems]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-8">
      {/* Header & Date Range Selector */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-light-on-surface">
            Shop Analytics & Profit
          </h1>
          <p className="font-body text-xs md:text-sm text-light-on-surface-variant">
            Performance metrics, customer expenditure, moving items and profit tracker
          </p>
        </div>

        {/* Date Range Picker */}
        <div className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-2.5 flex items-center gap-2 shadow-xs">
          <span className="material-symbols-outlined text-deep-green text-[20px]">date_range</span>
          <div className="flex items-center gap-1.5 text-xs font-label">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 rounded border border-light-outline-variant font-mono text-xs"
            />
            <span className="text-light-on-surface-variant">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 rounded border border-light-outline-variant font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Period Sales */}
        <article className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col justify-between gap-2">
          <header className="flex items-center justify-between">
            <h2 className="font-title text-xs font-bold text-light-on-surface-variant uppercase tracking-wider">
              Selected Period Sales
            </h2>
            <span className="w-9 h-9 rounded-full bg-gold-soft text-deep-green inline-flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">payments</span>
            </span>
          </header>
          <div>
            <p className="font-headline text-2xl md:text-3xl font-bold text-deep-green tabular-nums">
              ₹{totalPeriodSales.toLocaleString('en-IN')}
            </p>
            <p className="font-body text-xs text-light-on-surface-variant mt-0.5">
              Across {rangeBills.length} completed bills
            </p>
          </div>
        </article>

        {/* Card 2: Total Investment */}
        <article className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col justify-between gap-2">
          <header className="flex items-center justify-between">
            <h2 className="font-title text-xs font-bold text-light-on-surface-variant uppercase tracking-wider">
              Total Investment (Stock MRP)
            </h2>
            <span className="w-9 h-9 rounded-full bg-peacock-soft text-peacock-blue inline-flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">account_balance</span>
            </span>
          </header>
          <div>
            <p className="font-headline text-2xl md:text-3xl font-bold text-peacock-blue tabular-nums">
              ₹{totalInvestment.toLocaleString('en-IN')}
            </p>
            <p className="font-body text-xs text-light-on-surface-variant mt-0.5">
              Configured in Settings
            </p>
          </div>
        </article>

        {/* Card 3: Profit So Far */}
        <article className={`border-2 rounded-lg p-5 shadow-xs flex flex-col justify-between gap-2 ${
          profitSoFar >= 0 
            ? 'bg-light-primary-container border-deep-green' 
            : 'bg-red-soft border-bright-red'
        }`}>
          <header className="flex items-center justify-between">
            <h2 className={`font-title text-xs font-bold uppercase tracking-wider ${
              profitSoFar >= 0 ? 'text-deep-green' : 'text-bright-red'
            }`}>
              Profit So Far (Sales − Investment)
            </h2>
            <span className={`w-9 h-9 rounded-full inline-flex items-center justify-center ${
              profitSoFar >= 0 ? 'bg-deep-green text-white' : 'bg-bright-red text-white'
            }`}>
              <span className="material-symbols-outlined text-[20px]">
                {profitSoFar >= 0 ? 'trending_up' : 'trending_down'}
              </span>
            </span>
          </header>
          <div>
            <p className={`font-headline text-2xl md:text-3xl font-bold tabular-nums ${
              profitSoFar >= 0 ? 'text-deep-green' : 'text-bright-red'
            }`}>
              {profitSoFar >= 0 ? '+' : ''}₹{profitSoFar.toLocaleString('en-IN')}
            </p>
            <p className="font-body text-xs text-light-on-surface-variant mt-0.5">
              {profitSoFar >= 0 
                ? 'Investment fully recovered! Net profit earned.' 
                : `₹${Math.abs(profitSoFar).toLocaleString('en-IN')} remaining to break-even.`}
            </p>
          </div>
        </article>
      </section>

      {/* Grid: Sales per Date + Customers with Names and Amounts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Total Sales Per Date */}
        <article className="lg:col-span-5 bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-3">
          <header className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
            <h2 className="font-headline text-base font-bold text-light-on-surface">
              Sales Per Date
            </h2>
            <span className="font-mono text-xs text-light-on-surface-variant font-semibold">
              {salesPerDate.length} active dates
            </span>
          </header>

          <div className="flex-1 max-h-72 overflow-y-auto">
            {salesPerDate.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead className="bg-light-surface-container-low text-light-on-surface-variant font-label sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-2 py-2 text-center">Bills</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-outline-variant">
                  {salesPerDate.map((row) => (
                    <tr key={row.date} className="hover:bg-gold-soft/30">
                      <td className="px-3 py-2 font-mono font-bold text-deep-green">
                        {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(row.date))}
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-light-on-surface-variant">
                        {row.count}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-light-on-surface tabular-nums">
                        ₹{row.total.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-center py-10 text-xs text-light-on-surface-variant">
                No counter sales recorded in this date range.
              </p>
            )}
          </div>
        </article>

        {/* Customer List with Names and Amounts */}
        <article className="lg:col-span-7 bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-3">
          <header className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
            <h2 className="font-headline text-base font-bold text-light-on-surface">
              Customer Purchase Summary
            </h2>
            <span className="font-mono text-xs text-light-on-surface-variant font-semibold">
              {customerList.length} unique customers
            </span>
          </header>

          <div className="flex-1 max-h-72 overflow-y-auto">
            {customerList.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead className="bg-light-surface-container-low text-light-on-surface-variant font-label sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Customer Name</th>
                    <th className="px-3 py-2">Place</th>
                    <th className="px-2 py-2 text-center">Bills</th>
                    <th className="px-3 py-2 text-right">Total Spent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-outline-variant">
                  {customerList.map((cust, idx) => (
                    <tr key={idx} className="hover:bg-gold-soft/30">
                      <td className="px-3 py-2 font-title font-bold text-light-on-surface">
                        {cust.name}
                      </td>
                      <td className="px-3 py-2 font-body text-light-on-surface-variant">
                        {cust.place}
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-light-on-surface-variant">
                        {cust.billsCount}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-deep-green tabular-nums">
                        ₹{cust.totalAmount.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-center py-10 text-xs text-light-on-surface-variant">
                No customer orders found in this range.
              </p>
            )}
          </div>
        </article>
      </section>

      {/* Grid: Fast-Moving & Slow-Moving Crackers */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Fast-Moving Crackers */}
        <article className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-3">
          <header className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-deep-green text-[20px]">local_fire_department</span>
              <h2 className="font-headline text-base font-bold text-deep-green">
                Fast-Moving Crackers
              </h2>
            </div>
            <span className="font-label text-[11px] text-light-on-surface-variant">Top Sold</span>
          </header>

          <ul className="divide-y divide-light-outline-variant">
            {fastMoving.map((p, idx) => (
              <li key={idx} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-title font-bold text-light-on-surface">{p.name}</p>
                  <p className="font-body text-light-on-surface-variant">{p.category}</p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-mono font-bold text-deep-green">{p.qtySold} sold</p>
                  <p className="font-mono text-[11px] text-light-on-surface-variant">₹{p.revenue.toLocaleString('en-IN')}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>

        {/* Slow-Moving Crackers */}
        <article className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-3">
          <header className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-warning text-[20px]">history_toggle_off</span>
              <h2 className="font-headline text-base font-bold text-light-on-surface">
                Slow-Moving Crackers
              </h2>
            </div>
            <span className="font-label text-[11px] text-light-on-surface-variant">Low Demand</span>
          </header>

          <ul className="divide-y divide-light-outline-variant">
            {slowMoving.map((p, idx) => (
              <li key={idx} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-title font-bold text-light-on-surface">{p.name}</p>
                  <p className="font-body text-light-on-surface-variant">Stock: {p.currentStock} left</p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-mono font-bold text-warning">{p.qtySold} sold</p>
                  <p className="font-mono text-[11px] text-light-on-surface-variant">Consider special promo</p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      {/* Most Requested Crackers (Customer Demands) */}
      <section className="bg-light-surface-container-lowest border border-gold-border rounded-lg p-5 shadow-xs flex flex-col gap-3">
        <header className="flex items-center justify-between border-b border-light-outline-variant pb-2.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-gold text-[22px]">campaign</span>
            <h2 className="font-headline text-base font-bold text-light-on-surface">
              Most Requested Out-of-Stock Crackers
            </h2>
          </div>
          <span className="font-label text-xs text-deep-green font-bold">
            Aggregated from "Customer Asked For"
          </span>
        </header>

        <p className="font-body text-xs text-light-on-surface-variant">
          Items that customers specifically requested at the counter but were not stocked. Prioritize these for next supplier order!
        </p>

        {mostRequested.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            {mostRequested.map((req, idx) => (
              <div 
                key={idx}
                className="p-3 rounded-lg border border-gold-border bg-gold-soft/50 flex items-center justify-between shadow-xs"
              >
                <div>
                  <p className="font-title text-sm font-bold text-deep-green">{req.name}</p>
                  <p className="font-body text-[11px] text-light-on-surface-variant">
                    Last asked: {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(req.lastRequested))}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-deep-green text-white font-mono text-xs font-bold tabular-nums">
                  {req.count} reqs
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-light-on-surface-variant">
            No customer requests logged yet. Use the "Customer asked for" button in the header anytime!
          </div>
        )}
      </section>
    </div>
  );
}
