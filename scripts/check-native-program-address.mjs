import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { getProgramDerivedAddress, getAddressDecoder, isOffCurveAddress } from '@solana/kit';

// Only deterministic PUBLIC vectors: no accounts, signatures or RPC requests.
const [java = 'java', classpath] = process.argv.slice(2);
if (!classpath) throw new Error('Provide compiled native checker classpath');
const bytes = (label) => createHash('sha256').update(label).digest();
const address = getAddressDecoder().decode;
const lines = [], expected = [];
for (let i = 0; i < 512; i++) {
  const programAddress = address(bytes(`program-${i}`));
  const seeds = Array.from({ length: i % 16 }, (_, j) => bytes(`seed-${i}-${j}`).subarray(0, (i + j) % 33));
  const [key, bump] = await getProgramDerivedAddress({ programAddress, seeds });
  lines.push(['derive', programAddress, ...seeds.map((seed) => Buffer.from(seed).toString('base64'))].join(' '));
  expected.push(`${key}:${bump}`);
  const point = bytes(`curve-${i}`);
  lines.push(`curve ${point.toString('base64')}`);
  expected.push(String(!isOffCurveAddress(address(point))));
}
// Dalek accepts low-order/negative-zero encodings; key-validity APIs often don't.
// All y=0,+1,-1 and their noncanonical aliases (where representable) lie on curve.
const prime = (1n << 255n) - 19n;
for (const y of [0n, 1n, prime - 1n, prime, prime + 1n]) for (const sign of [0, 128]) {
  const point = Buffer.alloc(32); let value = y;
  for (let i = 0; i < 32; i++) { point[i] = Number(value & 255n); value >>= 8n; }
  point[31] |= sign;
  lines.push(`curve ${point.toString('base64')}`); expected.push('true');
}
const child = spawnSync(java, ['-cp', classpath, 'com.jamddmaj.ai.wallet.SolanaProgramAddressCheck'], {
  input: `${lines.join('\n')}\n`, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
});
if (child.error || child.status !== 0) throw child.error || new Error(child.stderr || `Native checker exited ${child.status}`);
assert.deepEqual(child.stdout.trim().split(/\r?\n/), expected);
console.log(`Native program-address derivation: ${lines.length} public vectors passed (Solana SDK comparison plus Dalek edge cases); no signing or submission.`);
