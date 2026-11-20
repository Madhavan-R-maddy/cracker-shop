import React, { useState } from 'react';
import { addRequestedItem } from '../lib/supabase';

export default function CustomerAskedModal({ isOpen, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await addRequestedItem(name.trim());
      setSuccess(true);
      if (onSaved) onSaved();
      setTimeout(() => {
        setName('');
        setSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error(err);
      alert('Failed to save request: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-light-surface-container-lowest border-2 border-gold-border rounded-lg p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-light-outline-variant pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-gold text-[24px]">add_comment</span>
            <h3 className="font-headline text-lg font-bold text-light-on-surface">Customer Asked For</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <p className="font-body text-xs text-light-on-surface-variant">
          Quickly record items customers ask for that are out of stock or not currently supplied.
        </p>

        {success ? (
          <div className="p-4 rounded-md bg-light-primary-container text-deep-green font-label text-sm text-center font-bold flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            Recorded! Saved in Requested Items.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-light-on-surface">Cracker Name / Variety</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Peacock Fountain 5-in-1, 5000 Wala, Electric Sky Shot..."
                required
                autoFocus
                className="min-h-12 px-3.5 py-2 rounded-md bg-light-surface-container-lowest border border-gold-border font-body text-sm text-light-on-surface focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 rounded-md border border-gold-border font-label text-sm text-light-on-surface hover:bg-light-surface-container"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="min-h-[42px] px-5 rounded-md bg-gold text-on-gold border border-gold-border font-label text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? 'Saving...' : 'Save Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
