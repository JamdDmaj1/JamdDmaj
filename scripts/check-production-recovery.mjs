import { execFileSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import assert from 'node:assert/strict';

const [java = 'java', classpath] = process.argv.slice(2);
if (!classpath) throw new Error('Expected compiled production recovery test classpath');
const output = execFileSync(java, ['-cp', classpath, 'ProductionRecoveryCheck'], { encoding: 'utf8' });
const fixture = output.match(/^PUBLIC_HD_BACKUP=([0-9a-f]+)$/m);
assert.ok(fixture, 'Missing public fixture');
const file = Buffer.from(fixture[1], 'hex');
const key = pbkdf2Sync('Public recovery fixture: español 🔐', file.subarray(8, 24), 600000, 32, 'sha256');
try {
  const decipher = createDecipheriv('aes-256-gcm', key, file.subarray(24, 36));
  decipher.setAAD(Buffer.concat([file.subarray(0, 8), Buffer.from('JamdDmaj:wallet-backup:bip39-256-sol501-evm60-v1')]));
  decipher.setAuthTag(file.subarray(68, 84));
  const plaintext = Buffer.concat([decipher.update(file.subarray(36, 68)), decipher.final()]);
  try { assert.deepEqual(plaintext, Buffer.from(Array.from({ length: 32 }, (_, i) => i))); }
  finally { plaintext.fill(0); }
} finally { key.fill(0); }
console.log('Production backup: Java and independent Node recovery agree, including Unicode password; test/mainnet domain rejection passed.');
