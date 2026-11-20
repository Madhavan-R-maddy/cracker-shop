import React, { useState, useEffect } from 'react';
import { isSessionUnlocked, setSessionUnlocked } from './lib/crypto';
import { 
  getProducts, 
  getBills, 
  getRequestedItems, 
  getSettings 
} from './lib/supabase';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import CustomerAskedModal from './components/CustomerAskedModal';
import PrintChoiceModal from './components/PrintChoiceModal';
import SetupInstructionsModal from './components/SetupInstructionsModal';

import PinScreen from './pages/PinScreen';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Stock from './pages/Stock';
import QrStickers from './pages/QrStickers';
import BillsHistory from './pages/BillsHistory';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import PrintA4 from './pages/PrintA4';
import PrintThermal58mm from './pages/PrintThermal58mm';

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(() => isSessionUnlocked());
  const [activePage, setActivePage] = useState('dashboard');

  // Business Data
  const [products, setProducts] = useState([]);
  const [bills, setBills] = useState([]);
  const [requestedItems, setRequestedItems] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  // Modals & Print flow
  const [printBill, setPrintBill] = useState(null);
  const [isPrintChoiceOpen, setIsPrintChoiceOpen] = useState(false);
  const [isCustomerAskedOpen, setIsCustomerAskedOpen] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

  // Fetch all initial data from Supabase
  async function loadData() {
    try {
      const [prods, bls, reqs, stgs] = await Promise.all([
        getProducts(),
        getBills(),
        getRequestedItems(),
        getSettings()
      ]);
      setProducts(prods || []);
      setBills(bls || []);
      setRequestedItems(reqs || []);
      setSettings(stgs || {});
    } catch (err) {
      console.error('Data loading error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleLockSession() {
    setSessionUnlocked(false);
    setIsUnlocked(false);
  }

  function handleUnlock() {
    setIsUnlocked(true);
  }

  function handleOpenPrintModal(bill) {
    setPrintBill(bill);
    setIsPrintChoiceOpen(true);
  }

  function handleSelectPrintFormat(format, bill) {
    setPrintBill(bill);
    if (format === 'a4') {
      setActivePage('print-a4');
    } else if (format === 'thermal') {
      setActivePage('print-thermal');
    }
  }

  // -------------------------------------------------------------
  // PIN LOCK SCREEN (If not unlocked on this device)
  // -------------------------------------------------------------
  if (!isUnlocked) {
    return <PinScreen onUnlock={handleUnlock} />;
  }

  // -------------------------------------------------------------
  // PRINT PAGES (FULLSCREEN PRINT LAYOUTS)
  // -------------------------------------------------------------
  if (activePage === 'print-a4' && printBill) {
    return (
      <PrintA4 
        bill={printBill} 
        onBack={() => setActivePage('billing')} 
      />
    );
  }

  if (activePage === 'print-thermal' && printBill) {
    return (
      <PrintThermal58mm 
        bill={printBill} 
        onBack={() => setActivePage('billing')} 
      />
    );
  }

  // -------------------------------------------------------------
  // MAIN APP SHELL (Header + Desktop Sidebar + Mobile Bottom Nav)
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-light-surface text-light-on-surface">
      {/* Compulsory Top Header with Large Shop Logo on every page */}
      <Header
        activePage={activePage}
        setActivePage={setActivePage}
        onOpenCustomerAsked={() => setIsCustomerAskedOpen(true)}
        onLockSession={handleLockSession}
        productsCount={products.length}
      />

      <div className="flex-1 flex">
        {/* Desktop Left Sidebar */}
        <Sidebar 
          activePage={activePage} 
          setActivePage={setActivePage} 
        />

        {/* Main Content Workspace */}
        <main className="flex-1 p-4 md:p-6 pb-24 lg:pb-8 max-w-7xl mx-auto w-full overflow-x-hidden">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-deep-green">
              <span className="material-symbols-outlined animate-spin text-[36px]">progress_activity</span>
              <p className="font-label text-sm font-bold">Loading store inventory & bills...</p>
            </div>
          ) : (
            <>
              {activePage === 'dashboard' && (
                <Dashboard
                  products={products}
                  bills={bills}
                  setActivePage={setActivePage}
                />
              )}

              {activePage === 'billing' && (
                <Billing
                  products={products}
                  bills={bills}
                  onBillCreated={() => loadData()}
                  onOpenPrintModal={handleOpenPrintModal}
                />
              )}

              {activePage === 'stock' && (
                <Stock
                  products={products}
                  onRefresh={loadData}
                  setActivePage={setActivePage}
                />
              )}

              {activePage === 'qr-stickers' && (
                <QrStickers
                  products={products}
                />
              )}

              {activePage === 'bills' && (
                <BillsHistory
                  bills={bills}
                  products={products}
                  onRefresh={loadData}
                  onOpenPrintModal={handleOpenPrintModal}
                />
              )}

              {activePage === 'analytics' && (
                <Analytics
                  bills={bills}
                  products={products}
                  requestedItems={requestedItems}
                  settings={settings}
                />
              )}

              {activePage === 'settings' && (
                <Settings
                  settings={settings}
                  products={products}
                  bills={bills}
                  requestedItems={requestedItems}
                  onRefresh={loadData}
                  onOpenSetupInstructions={() => setIsSetupModalOpen(true)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Sticky Bottom Navigation */}
      <BottomNav
        activePage={activePage}
        setActivePage={setActivePage}
      />

      {/* Print Format Choice Modal (A4 or 58mm Thermal only) */}
      <PrintChoiceModal
        isOpen={isPrintChoiceOpen}
        onClose={() => setIsPrintChoiceOpen(false)}
        bill={printBill}
        onSelectFormat={handleSelectPrintFormat}
      />

      {/* Customer Asked For Quick Modal */}
      <CustomerAskedModal
        isOpen={isCustomerAskedOpen}
        onClose={() => setIsCustomerAskedOpen(false)}
        onSaved={loadData}
      />

      {/* Setup Instructions Modal */}
      <SetupInstructionsModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
      />
    </div>
  );
}
