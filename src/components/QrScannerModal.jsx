import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function QrScannerModal({ isOpen, onClose, onScan, products = [] }) {
  const [scannerError, setScannerError] = useState('');
  const [lastScannedCode, setLastScannedCode] = useState('');
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {}).finally(() => {
          html5QrCodeRef.current = null;
        });
      }
      return;
    }

    const scannerId = 'qr-reader-container';

    // Delay slightly to let modal DOM mount
    const timer = setTimeout(() => {
      const qrCode = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = qrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      qrCode.start(
        { facingMode: 'environment' }, // Rear camera on mobile
        config,
        (decodedText) => {
          // Play a small beep if possible
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
          } catch {}

          setLastScannedCode(decodedText);
          onScan(decodedText);
        },
        () => {
          // Frame error (normal while searching for QR)
        }
      ).catch((err) => {
        setScannerError(err?.message || 'Unable to access device camera. Please grant camera permission.');
      });
    }, 200);

    return () => {
      clearTimeout(timer);
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {}).finally(() => {
          html5QrCodeRef.current = null;
        });
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-light-surface-container-lowest border-2 border-gold-border rounded-xl shadow-2xl p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-light-outline-variant pb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-deep-green text-[24px]">qr_code_scanner</span>
            <h3 className="font-headline text-base font-bold text-light-on-surface">Scan Cracker QR</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Camera Viewfinder */}
        <div className="relative w-full rounded-lg overflow-hidden bg-black aspect-square flex flex-col items-center justify-center border-2 border-gold">
          <div id="qr-reader-container" className="w-full h-full" />
          
          {scannerError && (
            <div className="absolute inset-0 bg-black/90 p-4 flex flex-col items-center justify-center text-center gap-2 text-white">
              <span className="material-symbols-outlined text-bright-red text-[40px]">videocam_off</span>
              <p className="font-title text-sm font-bold">Camera Access Error</p>
              <p className="font-body text-xs text-light-surface-container">{scannerError}</p>
              <p className="text-[11px] text-gold mt-1">You can also use the quick test simulation buttons below.</p>
            </div>
          )}

          {lastScannedCode && (
            <div className="absolute bottom-2 inset-x-2 bg-deep-green/95 text-white py-1 px-3 rounded text-center text-xs font-mono font-bold border border-gold animate-bounce">
              ✓ Scanned: {lastScannedCode} (Qty +1)
            </div>
          )}
        </div>

        <p className="font-body text-xs text-light-on-surface-variant text-center">
          Point device camera at any cracker QR sticker. Scanning again increments the quantity automatically.
        </p>

        {/* Quick test buttons for convenience */}
        <div className="flex flex-col gap-1.5 border-t border-light-outline-variant pt-2">
          <span className="font-label text-[11px] text-light-on-surface-variant text-center font-bold">
            Or tap to test scan sample cracker:
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {products.slice(0, 4).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onScan(p.qr_code || p.name);
                  setLastScannedCode(p.name);
                }}
                className="px-2 py-1.5 rounded bg-gold-soft border border-gold-border font-title text-xs font-bold text-deep-green hover:bg-gold hover:text-on-gold truncate"
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-11 rounded-md bg-deep-green text-white font-label text-xs font-bold hover:opacity-90 mt-1"
        >
          Done Scanning
        </button>
      </div>
    </div>
  );
}
