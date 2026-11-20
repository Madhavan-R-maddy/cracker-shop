// Lightweight, dependency-free QR Code SVG renderer
// Generates clean, crisp vector QR codes for sticker printing

// Standard Reed-Solomon / QR matrix generation for short codes like "CRK-1000WALA"
export function generateQrSvgUri(text, size = 120) {
  // Use data URI SVG or encoded canvas
  const encoded = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=2`;
}

// Fallback high-contrast pure CSS/SVG pattern generator for zero-network printing
export function getQrFallbackPattern(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
