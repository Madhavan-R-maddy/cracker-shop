import React, { useState } from 'react';
import { hashPin, setSessionUnlocked } from '../lib/crypto';
import { getSettings } from '../lib/supabase';

export default function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleDigit(d) {
    if (pin.length < 6) {
      setPin(prev => prev + d);
      setError('');
    }
  }

  function handleBackspace() {
    setPin(prev => prev.slice(0, -1));
    setError('');
  }

  function handleClear() {
    setPin('');
    setError('');
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!pin) {
      setError('Please enter your 4-digit PIN');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const hashedInput = await hashPin(pin);
      const settings = await getSettings();
      const storedHash = settings?.pin_hash || '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // default 1234

      if (hashedInput === storedHash) {
        setSuccess(true);
        setSessionUnlocked(true);
        setTimeout(() => {
          onUnlock();
        }, 500);
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch (err) {
      console.error(err);
      setError('Verification error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-light-surface">
      <div className="w-full max-w-sm bg-light-surface-container-lowest border-2 border-gold-border rounded-xl shadow-xl p-6 flex flex-col items-center gap-5">
        
        {/* Compulsory Large Shop Logo (No shop name as text) */}
        <div className="w-full flex flex-col items-center gap-2">
          <div className="w-64 h-36 rounded-lg border border-gold-border bg-light-surface-container-lowest p-2 flex items-center justify-center overflow-hidden shadow-sm">
            <img 
              src="/logo.jpg" 
              alt="Shop Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-center gap-1.5 text-deep-green font-label text-xs font-semibold">
            <span className="material-symbols-outlined text-gold text-[16px]">auto_awesome</span>
            <span className="text-light-on-surface-variant">Owner Terminal Access</span>
            <span className="material-symbols-outlined text-gold text-[16px]">auto_awesome</span>
          </div>
        </div>

        {/* PIN Entry Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 w-full">
            <label htmlFor="pin-display" className="font-label text-xs font-bold text-light-on-surface text-center">
              Enter Owner PIN
            </label>
            <div className="relative flex items-center">
              <input
                id="pin-display"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setError('');
                }}
                placeholder="••••"
                required
                className="w-full min-h-14 px-4 py-3 rounded-lg bg-light-surface-container-low border-2 border-gold-border font-mono text-2xl text-center tracking-[0.4em] text-deep-green font-bold placeholder:text-light-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-gold focus:border-deep-green shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                aria-label="Toggle PIN visibility"
                className="absolute right-3 w-10 h-10 inline-flex items-center justify-center rounded text-light-on-surface-variant hover:text-deep-green"
              >
                <span className="material-symbols-outlined text-[22px]">
                  {showPin ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            <span className="font-body text-[11px] text-light-on-surface-variant text-center">
              Default factory PIN: <strong className="font-mono text-deep-green">1234</strong> (changeable in Settings)
            </span>
          </div>

          {error && (
            <p className="text-center font-label text-xs font-bold text-bright-red bg-red-soft py-1.5 px-3 rounded-md border border-bright-red/30 animate-shake">
              {error}
            </p>
          )}

          {success && (
            <p className="text-center font-label text-xs font-bold text-success bg-light-primary-container py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              PIN verified! Opening counter...
            </p>
          )}

          {/* Quick-tap 3x4 Touch Keypad for phone/counter use */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigit(String(digit))}
                className="min-h-12 rounded-lg bg-light-surface-container-low border border-light-outline-variant font-mono text-lg font-bold text-light-on-surface hover:bg-gold-soft active:scale-[0.96] transition-all shadow-xs"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="min-h-12 rounded-lg bg-light-surface-container-lowest border border-light-outline-variant font-label text-xs font-bold text-bright-red hover:bg-red-soft active:scale-[0.96] transition-all shadow-xs"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="min-h-12 rounded-lg bg-light-surface-container-low border border-light-outline-variant font-mono text-lg font-bold text-light-on-surface hover:bg-gold-soft active:scale-[0.96] transition-all shadow-xs"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              aria-label="Backspace"
              className="min-h-12 rounded-lg bg-light-surface-container-low border border-light-outline-variant text-light-on-surface hover:bg-gold-soft active:scale-[0.96] inline-flex items-center justify-center transition-all shadow-xs"
            >
              <span className="material-symbols-outlined text-[20px]">backspace</span>
            </button>
          </div>

          {/* Unlock Submit Button */}
          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full inline-flex items-center justify-center gap-2 min-h-13 px-5 py-3 rounded-lg bg-gold text-on-gold border border-gold-border font-label text-sm font-bold shadow-md hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">lock_open</span>
            <span>{loading ? 'Verifying...' : 'Unlock Terminal'}</span>
          </button>
        </form>
      </div>
    </main>
  );
}
