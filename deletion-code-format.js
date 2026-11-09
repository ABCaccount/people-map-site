// Presentation only. The backend still receives the exact canonical D2 string.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CANONICAL = /^D2-[A-Za-z0-9_-]{21}[AQgw](?![\s\S])/;

/** @param {string} code @returns {Uint8Array} */
function canonicalBytes(code) {
  if (!CANONICAL.test(code)) throw Error('Invalid deletion code');
  const raw = atob(code.slice(3).replace(/-/g, '+').replace(/_/g, '/') + '==');
  if (raw.length !== 16) throw Error('Invalid deletion code');
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

/** @param {Uint8Array} bytes @returns {string} */
function canonicalFor(bytes) {
  if (bytes.length !== 16) throw Error('Invalid deletion code');
  return 'D2-' + btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Lossless RFC 4648 Base32: 128 bits, 26 characters, no '=' padding.
 * @param {string} canonical @returns {string}
 */
export function displayDeletionCode(canonical) {
  let buffer = 0, bits = 0, result = '';
  for (const byte of canonicalBytes(canonical)) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits) result += BASE32[(buffer << (5 - bits)) & 31];
  return result;
}

/** Accept legacy D2 or the new Base32 presentation. Never strip punctuation
 * or change case inside a legacy Base64URL credential.
 * @param {unknown} input @returns {string | null}
 */
export function normalizeDeletionCode(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (CANONICAL.test(value)) return value;
  if (!/^[A-Za-z2-7]{26}(?![\s\S])/.test(value)) return null;
  const upper = value.toUpperCase();
  const bytes = [];
  let buffer = 0, bits = 0;
  for (const char of upper) {
    buffer = (buffer << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
    buffer &= (1 << bits) - 1;
  }
  // The final two encoding bits must be zero, not alternate credential aliases.
  if (bytes.length !== 16 || bits !== 2 || buffer !== 0) return null;
  return canonicalFor(Uint8Array.from(bytes));
}
