// Secure SHA-256 Hashing using browser Web Crypto API
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isSessionUnlocked() {
  return sessionStorage.getItem('cracker_unlocked') === 'true';
}

export function setSessionUnlocked(unlocked = true) {
  if (unlocked) {
    sessionStorage.setItem('cracker_unlocked', 'true');
  } else {
    sessionStorage.removeItem('cracker_unlocked');
  }
}
