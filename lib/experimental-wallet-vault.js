// Experimental, offline key-storage primitive. Not included in production builds.
// No address generation, network requests, transaction signing, or mainnet support.
const TYPE = 'jamddmaj-test-vault';
const ITERATIONS = 600000;
const aad = new TextEncoder().encode(TYPE + ':1:test-only');
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
function bytes(value, length) {
  if (typeof value !== 'string' || value.length !== length * 2 || !/^[a-f0-9]+$/.test(value)) throw new Error('Invalid backup');
  return Uint8Array.from(value.match(/../g), v => parseInt(v, 16));
}
async function key(password, salt) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 1024) throw new Error('Use a long passphrase');
  const material = new TextEncoder().encode(password);
  try {
    const base = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  } finally { material.fill(0); }
}
export async function sealTestSecret(secret, password) {
  if (!(secret instanceof Uint8Array) || secret.length !== 32) throw new Error('Expected 32-byte test secret');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const copy = secret.slice();
  try {
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},await key(password,salt),copy);
    return {type:TYPE,version:1,network:'test-only',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,cipher:'AES-256-GCM',salt:hex(salt),iv:hex(iv),ciphertext:hex(new Uint8Array(encrypted))};
  } finally { copy.fill(0); }
}
export async function openTestSecret(backup, password) {
  if (!backup || backup.type !== TYPE || backup.version !== 1 || backup.network !== 'test-only'
      || backup.kdf !== 'PBKDF2-SHA256' || backup.iterations !== ITERATIONS || backup.cipher !== 'AES-256-GCM') throw new Error('Unsupported backup');
  const salt=bytes(backup.salt,16),iv=bytes(backup.iv,12),ciphertext=bytes(backup.ciphertext,48);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},await key(password,salt),ciphertext));
  } catch { throw new Error('Invalid passphrase or damaged backup'); }
}

// Bounded portable file format for offline testing; never stores the passphrase.
export function serializeTestBackup(backup) {
  const text=JSON.stringify(backup);
  parseTestBackup(text);
  return text;
}
export function parseTestBackup(text) {
  if(typeof text!=='string'||text.length>2048)throw new Error('Invalid backup file');
  let backup;try{backup=JSON.parse(text)}catch{throw new Error('Invalid backup file')}
  const fields=['type','version','network','kdf','iterations','cipher','salt','iv','ciphertext'];
  if(!backup||Array.isArray(backup)||Object.keys(backup).length!==fields.length||!fields.every(field=>Object.hasOwn(backup,field)))throw new Error('Invalid backup file');
  if(backup.type!==TYPE||backup.version!==1||backup.network!=='test-only'||backup.kdf!=='PBKDF2-SHA256'||backup.iterations!==ITERATIONS||backup.cipher!=='AES-256-GCM')throw new Error('Unsupported backup');
  bytes(backup.salt,16);bytes(backup.iv,12);bytes(backup.ciphertext,48);
  return Object.freeze(backup);
}
