import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function aad(value) {
  if (typeof value !== 'string' || !value || value.length > 512) throw Error('LIVE_VAULT_AAD_INVALID');
  return Buffer.from(value, 'utf8');
}

export function createVault(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('LIVE_VAULT_KEY_INVALID');
  return Object.freeze({
    seal(plaintext, context) {
      if (typeof plaintext !== 'string' || !plaintext || plaintext.length > 4096) throw Error('LIVE_VAULT_SECRET_INVALID');
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
    },
    open(sealed, context) {
      if (typeof sealed !== 'string' || sealed.length > 8192) throw Error('LIVE_VAULT_CIPHERTEXT_INVALID');
      const parts = sealed.split('.');
      if (parts.length !== 4 || parts[0] !== VERSION) throw Error('LIVE_VAULT_CIPHERTEXT_INVALID');
      const iv = Buffer.from(parts[1], 'base64');
      const tag = Buffer.from(parts[2], 'base64');
      const ciphertext = Buffer.from(parts[3], 'base64');
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !ciphertext.length) throw Error('LIVE_VAULT_CIPHERTEXT_INVALID');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(aad(context));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }
  });
}

export function vaultContext({accountHash, connectionId, exchange}) {
  for (const value of [accountHash, connectionId, exchange]) {
    if (typeof value !== 'string' || !value || value.length > 128) throw Error('LIVE_VAULT_CONTEXT_INVALID');
  }
  return `${accountHash}|${connectionId}|${exchange}`;
}
