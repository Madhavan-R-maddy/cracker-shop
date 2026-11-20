import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Audio feedback helper using Web Audio API
function playScanSound(isSuccess = true) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (isSuccess) {
      // Pleasant high-pitch success chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08); // D6
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } else {
      // Low buzz for unknown code
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    console.warn('Audio feedback failed:', e);
  }
}

// Vibration feedback helper
function triggerVibrate(isSuccess = true) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(isSuccess ? 80 : [100, 50, 100]);
    }
  } catch {}
}

export default function QrScannerModal({ 
  isOpen, 
  onClose, 
  onScan, 
  products = [],
  items = [] 
}) {
  const [scannerError, setScannerError] = useState('');
  const [scanStatus, setScanStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const [mountKey, setMountKey] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const html5QrCodeRef = useRef(null);
  const lastScannedCodeRef = useRef('');
  const lastScannedTimeRef = useRef(0);
  const isStoppingRef = useRef(false);
  const statusTimerRef = useRef(null);

  // Compute live bill totals
  const runningTotal = items.reduce((sum, item) => sum + (parseFloat(item.rate) || 0) * (parseInt(item.qty, 10) || 0), 0);
  const totalItemCount = items.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);

  // Handle scanned decoded text
  function handleDecoded(decodedText) {
    if (!decodedText || isStoppingRef.current) return;
    const cleanText = decodedText.trim();
    if (!cleanText) return;

    const now = Date.now();
    // Double counting prevention: ignore SAME code within 1.5 seconds cooldown
    if (
      cleanText.toLowerCase() === lastScannedCodeRef.current.toLowerCase() &&
      now - lastScannedTimeRef.current < 1500
    ) {
      return;
    }

    lastScannedCodeRef.current = cleanText;
    lastScannedTimeRef.current = now;

    // Call onScan handler passed from Billing
    const result = onScan(cleanText);

    if (result && result.success) {
      playScanSound(true);
      triggerVibrate(true);

      const crackerName = result.product?.name || 'Cracker';
      const qty = result.newQty || 1;

      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      setScanStatus({
        type: 'success',
        message: `Added: ${crackerName} (x${qty})`
      });

      statusTimerRef.current = setTimeout(() => {
        setScanStatus(null);
      }, 2000);
    } else {
      playScanSound(false);
      triggerVibrate(false);

      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      setScanStatus({
        type: 'error',
        message: `No cracker found for: "${cleanText}"`
      });

      statusTimerRef.current = setTimeout(() => {
        setScanStatus(null);
      }, 2500);
    }
  }

  // Cleanly stop camera and close modal
  async function handleStopAndClose() {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);

    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error stopping html5QrCode:', err);
      } finally {
        html5QrCodeRef.current = null;
      }
    }

    // Release any lingering media stream video tracks
    try {
      const containerId = `qr-reader-container-${mountKey}`;
      const videoElem = document.querySelector(`#${containerId} video`);
      if (videoElem && videoElem.srcObject) {
        const stream = videoElem.srcObject;
        stream.getTracks().forEach(t => t.stop());
        videoElem.srcObject = null;
      }
    } catch {}

    setIsCameraActive(false);
    isStoppingRef.current = false;
    onClose();
  }

  // Camera start / stop lifecycle
  useEffect(() => {
    if (!isOpen) {
      setScanStatus(null);
      setScannerError('');
      setIsCameraActive(false);
      return;
    }

    // Increment mountKey to get a clean DOM container ID every time scanner opens
    const currentMount = mountKey + 1;
    setMountKey(currentMount);
    setScannerError('');
    setScanStatus(null);
    lastScannedCodeRef.current = '';
    lastScannedTimeRef.current = 0;
    isStoppingRef.current = false;

    const containerId = `qr-reader-container-${currentMount}`;

    // Small delay to ensure the modal DOM element is rendered with dimensions
    const startTimer = setTimeout(async () => {
      const containerEl = document.getElementById(containerId);
      if (!containerEl) return;
      containerEl.innerHTML = '';

      try {
        const qrCode = new Html5Qrcode(containerId, { verbose: false });
        html5QrCodeRef.current = qrCode;

        const config = {
          fps: 15, // Higher FPS for fast continuous scanning
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const edge = Math.max(180, Math.floor(minEdge * 0.72));
            return { width: edge, height: edge };
          },
          aspectRatio: 1.0,
          disableFlip: false
        };

        await qrCode.start(
          { facingMode: 'environment' }, // Back camera by default
          config,
          (decodedText) => {
            handleDecoded(decodedText);
          },
          () => {
            // Frame search error (silent)
          }
        );

        setIsCameraActive(true);
      } catch (err) {
        console.error('Camera initialization error:', err);
        setScannerError(
          err?.message || 
          'Unable to access camera. Please ensure camera permissions are granted and the site is opened via HTTPS.'
        );
      }
    }, 180);

    return () => {
      clearTimeout(startTimer);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);

      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop().catch(() => {});
          }
          html5QrCodeRef.current.clear();
        } catch {}
        html5QrCodeRef.current = null;
      }

      try {
        const videoElem = document.querySelector(`#${containerId} video`);
        if (videoElem && videoElem.srcObject) {
          videoElem.srcObject.getTracks().forEach(t => t.stop());
          videoElem.srcObject = null;
        }
      } catch {}
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentContainerId = `qr-reader-container-${mountKey}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg bg-light-surface-container-lowest border-2 border-gold-border rounded-xl shadow-2xl p-4 sm:p-5 flex flex-col gap-3.5 max-h-[94vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-light-outline-variant pb-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-deep-green text-[24px]">qr_code_scanner</span>
            <div>
              <h3 className="font-headline text-base sm:text-lg font-bold text-light-on-surface">
                Continuous QR Scanner
              </h3>
              <p className="font-body text-[11px] text-light-on-surface-variant">
                Camera stays on. Scan items back-to-back, tap Done when finished.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStopAndClose}
            className="w-8 h-8 rounded inline-flex items-center justify-center text-light-on-surface-variant hover:bg-light-surface-container transition-colors"
            title="Close Scanner"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Viewfinder Frame with instant visual feedback */}
        <div className={`relative w-full rounded-xl overflow-hidden bg-black aspect-video sm:aspect-square flex flex-col items-center justify-center border-4 transition-all duration-300 shrink-0 ${
          scanStatus?.type === 'success' 
            ? 'border-deep-green ring-4 ring-deep-green/30 shadow-[0_0_24px_rgba(26,77,46,0.6)]' 
            : scanStatus?.type === 'error'
              ? 'border-bright-red ring-4 ring-bright-red/30 shadow-[0_0_24px_rgba(211,47,47,0.6)]'
              : 'border-gold shadow-md'
        }`}>
          {/* HTML5 QR Code Container */}
          <div id={currentContainerId} className="w-full h-full" />

          {/* Instant feedback notification banner */}
          {scanStatus && (
            <div className={`absolute top-2.5 inset-x-3 py-2 px-3.5 rounded-lg text-white font-title text-xs sm:text-sm font-bold text-center shadow-lg border animate-in fade-in slide-in-from-top-2 z-30 transition-all ${
              scanStatus.type === 'success' 
                ? 'bg-deep-green/95 border-gold shadow-deep-green/50 ring-2 ring-gold/40' 
                : 'bg-bright-red/95 border-white shadow-bright-red/50 ring-2 ring-white/30'
            }`}>
              <div className="flex items-center justify-center gap-1.5 truncate">
                <span className="material-symbols-outlined text-[20px] shrink-0">
                  {scanStatus.type === 'success' ? 'check_circle' : 'error'}
                </span>
                <span className="truncate">{scanStatus.message}</span>
              </div>
            </div>
          )}

          {/* Camera Access Error Message */}
          {scannerError && (
            <div className="absolute inset-0 bg-black/92 p-5 flex flex-col items-center justify-center text-center gap-2.5 text-white z-20">
              <span className="material-symbols-outlined text-bright-red text-[44px]">videocam_off</span>
              <p className="font-title text-sm font-bold text-white">Camera Access Error</p>
              <p className="font-body text-xs text-light-surface-container max-w-xs">{scannerError}</p>
              <p className="text-[11px] text-gold mt-1 font-body">
                Make sure you are on HTTPS and camera permission is allowed. You can also tap the simulation buttons below to test.
              </p>
            </div>
          )}

          {/* Active scanning targeting reticle */}
          {!scannerError && isCameraActive && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-dashed border-white/60 rounded-xl relative">
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-gold" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-gold" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-gold" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-gold" />
              </div>
            </div>
          )}
        </div>

        {/* Compact Live Bill List inside Scanner Popup */}
        <div className="flex flex-col gap-1.5 min-h-0 flex-1">
          <div className="flex items-center justify-between text-xs font-label px-1">
            <span className="font-bold text-light-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-deep-green">receipt_long</span>
              Current Bill ({totalItemCount} items)
            </span>
            <span className="font-mono font-bold text-deep-green text-sm">
              Total: ₹{runningTotal.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-36 sm:max-h-44 border border-gold-border rounded-lg bg-light-surface-container-low divide-y divide-light-outline-variant shadow-inner">
            {items.length > 0 ? (
              items.map((item, idx) => (
                <div key={item.id || idx} className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-gold-soft/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-deep-green text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      {item.qty}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-title font-bold text-light-on-surface truncate">
                        {item.name}
                      </span>
                      <span className="font-body text-[10px] text-light-on-surface-variant">
                        ₹{item.rate} / {item.unit || 'box'}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-deep-green tabular-nums shrink-0 text-xs">
                    ₹{(item.rate * item.qty).toLocaleString('en-IN')}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-light-on-surface-variant font-body text-xs flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-gold text-[24px]">qr_code_2</span>
                <p className="font-title text-xs font-bold text-light-on-surface">No crackers scanned yet</p>
                <p className="text-[11px]">Point camera at any cracker QR sticker to add it</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick simulation buttons for testing */}
        {products.length > 0 && (
          <div className="flex flex-col gap-1 pt-1 border-t border-light-outline-variant shrink-0">
            <span className="font-label text-[10px] text-light-on-surface-variant font-semibold">
              Tap to simulate scan:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {products.slice(0, 5).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleDecoded(p.qr_code || p.name)}
                  className="px-2.5 py-1 rounded bg-white border border-gold-border font-title text-[11px] font-bold text-deep-green hover:bg-gold-soft active:scale-95 transition-all whitespace-nowrap shrink-0 shadow-2xs"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Done Button */}
        <button
          type="button"
          onClick={handleStopAndClose}
          className="w-full min-h-12 px-5 py-3 rounded-lg bg-deep-green text-white font-label text-sm font-bold shadow-md hover:opacity-90 active:scale-98 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span>Done (Show Bill)</span>
        </button>
      </div>
    </div>
  );
}
