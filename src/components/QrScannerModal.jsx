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
  const cameraTimeoutRef = useRef(null);

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

    // Safety timeout: if camera doesn't start within 5s, display clear message instead of a plain black box
    cameraTimeoutRef.current = setTimeout(() => {
      setScannerError(prev => {
        if (!prev) {
          return 'Camera not available. Please allow camera permission or use search to add items.';
        }
        return prev;
      });
    }, 5000);

    // Small delay to ensure the modal DOM element is rendered with dimensions
    const startTimer = setTimeout(async () => {
      const containerEl = document.getElementById(containerId);
      if (!containerEl) return;
      containerEl.innerHTML = '';

      // Check browser mediaDevices support
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
        setScannerError(
          'Camera not available. Please allow camera permission or use search to add items.'
        );
        setIsCameraActive(false);
        return;
      }

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

        if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
        setIsCameraActive(true);
      } catch (err) {
        console.error('Camera initialization error:', err);
        if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
        setScannerError(
          'Camera not available. Please allow camera permission or use search to add items.'
        );
        setIsCameraActive(false);
      }
    }, 180);

    return () => {
      clearTimeout(startTimer);
      if (cameraTimeoutRef.current) clearTimeout(cameraTimeoutRef.current);
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
        
        {/* Header with Instruction Text */}
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

        {/* Viewfinder Frame with visual feedback & error messaging */}
        <div className={`relative w-full rounded-xl overflow-hidden bg-neutral-950 aspect-video sm:aspect-square flex flex-col items-center justify-center border-4 transition-all duration-300 shrink-0 ${
          scanStatus?.type === 'success' 
            ? 'border-deep-green ring-4 ring-deep-green/30 shadow-[0_0_24px_rgba(26,77,46,0.6)]' 
            : scanStatus?.type === 'error'
              ? 'border-bright-red ring-4 ring-bright-red/30 shadow-[0_0_24px_rgba(211,47,47,0.6)]'
              : 'border-gold shadow-md'
        }`}>
          {/* HTML5 QR Code Container */}
          <div id={currentContainerId} className="w-full h-full" />

          {/* Loading indicator while camera initializes */}
          {!scannerError && !isCameraActive && (
            <div className="absolute inset-0 bg-neutral-950/90 flex flex-col items-center justify-center gap-2.5 text-white p-4 text-center z-10">
              <span className="material-symbols-outlined text-gold text-3xl animate-spin">progress_activity</span>
              <p className="font-title text-sm font-semibold text-gold">Opening camera...</p>
            </div>
          )}

          {/* Camera Not Available Message inside Camera Area (replaces black box) */}
          {scannerError && (
            <div className="absolute inset-0 bg-neutral-950/98 p-6 flex flex-col items-center justify-center text-center gap-3 text-white z-20">
              <div className="w-14 h-14 rounded-full bg-bright-red/15 border-2 border-bright-red/60 flex items-center justify-center text-bright-red mb-1 shadow-lg">
                <span className="material-symbols-outlined text-[32px]">videocam_off</span>
              </div>
              <p className="font-title text-base font-bold text-white tracking-wide">
                Camera Not Available
              </p>
              <p className="font-body text-xs sm:text-sm text-neutral-300 max-w-sm leading-relaxed">
                {scannerError}
              </p>
              <div className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold/15 border border-gold/40 text-gold text-xs font-semibold">
                <span className="material-symbols-outlined text-[16px]">search</span>
                <span>Use search on the Billing page to add crackers</span>
              </div>
            </div>
          )}

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

        {/* Done Scanning Button */}
        <button
          type="button"
          onClick={handleStopAndClose}
          className="w-full min-h-12 px-5 py-3 rounded-lg bg-deep-green text-white font-label text-sm font-bold shadow-md hover:opacity-90 active:scale-98 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span>Done Scanning</span>
        </button>
      </div>
    </div>
  );
}
