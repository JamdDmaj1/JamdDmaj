// Minimal WebAuthn helpers for edge functions: base64url, CBOR, COSE and ES256.
export function b64uEncode(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('invalid-b64u');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
function cborLength(bytes, offset, add) {
  if (add < 24) return [add, offset];
  if (add === 24) return [bytes[offset], offset + 1];
  if (add === 25) return [(bytes[offset] << 8) | bytes[offset + 1], offset + 2];
  if (add === 26) return [((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0, offset + 4];
  throw Error('cbor-unsupported');
}
export function cborDecode(bytes, offset = 0) {
  const first = bytes[offset];
  if (first === undefined) throw Error('cbor-eof');
  const major = first >> 5, add = first & 31, at = offset + 1;
  if (major === 7) {
    if (add === 20) return [false, at];
    if (add === 21) return [true, at];
    if (add === 22) return [null, at];
    throw Error('cbor-simple');
  }
  const [length, next] = cborLength(bytes, at, add);
  if (major === 0) return [length, next];
  if (major === 1) return [-1 - length, next];
  if (major === 2) return [bytes.slice(next, next + length), next + length];
  if (major === 3) return [new TextDecoder().decode(bytes.slice(next, next + length)), next + length];
  if (major === 4) {
    const items = [];
    let cursor = next;
    for (let i = 0; i < length; i++) { const [item, after] = cborDecode(bytes, cursor); items.push(item); cursor = after; }
    return [items, cursor];
  }
  if (major === 5) {
    const map = {};
    let cursor = next;
    for (let i = 0; i < length; i++) {
      const [key, afterKey] = cborDecode(bytes, cursor);
      const [value, afterValue] = cborDecode(bytes, afterKey);
      map[typeof key === 'string' ? key : String(key)] = value;
      cursor = afterValue;
    }
    return [map, cursor];
  }
  throw Error('cbor-major');
}
export function parseAuthenticatorData(bytes) {
  if (bytes.length < 37) throw Error('authdata-short');
  const rpIdHash = bytes.slice(0, 32);
  const flags = bytes[32];
  const counter = ((bytes[33] << 24) | (bytes[34] << 16) | (bytes[35] << 8) | bytes[36]) >>> 0;
  let offset = 37;
  let credentialId = null;
  let publicKey = null;
  if (flags & 0x40) {
    offset += 16;
    const idLength = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;
    credentialId = bytes.slice(offset, offset + idLength);
    offset += idLength;
    const [cose] = cborDecode(bytes, offset);
    publicKey = cose;
  }
  return { rpIdHash, flags, counter, credentialId, publicKey };
}
export async function coseToJwk(cose) {
  const kty = cose[1], crv = cose[-1], x = cose[-2], y = cose[-3];
  if (kty !== 2 || crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw Error('cose-unsupported');
  return { kty: 'EC', crv: 'P-256', x: b64uEncode(x), y: b64uEncode(y), ext: false };
}
function derToRaw(signature) {
  if (signature[0] !== 0x30) throw Error('der-format');
  let offset = 2;
  if (signature[1] & 0x80) offset += signature[1] & 0x7f;
  if (signature[offset] !== 0x02) throw Error('der-r');
  const rLength = signature[offset + 1];
  const r = signature.slice(offset + 2, offset + 2 + rLength);
  offset = offset + 2 + rLength;
  if (signature[offset] !== 0x02) throw Error('der-s');
  const sLength = signature[offset + 1];
  const s = signature.slice(offset + 2, offset + 2 + sLength);
  const raw = new Uint8Array(64);
  raw.set(r.subarray(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length));
  raw.set(s.subarray(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length));
  return raw;
}
export async function verifyAssertion({ publicKey, authenticatorData, clientDataJSON, signature }) {
  const jwk = JSON.parse(JSON.stringify(publicKey));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const authHash = await sha256(clientDataJSON);
  const data = new Uint8Array(authenticatorData.length + authHash.length);
  data.set(authenticatorData, 0);
  data.set(authHash, authenticatorData.length);
  const raw = derToRaw(signature);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, data);
}
