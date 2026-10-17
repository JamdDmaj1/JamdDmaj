import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { getAddressEncoder, getAddressDecoder, getTransactionDecoder, getCompiledTransactionMessageDecoder } from '@solana/kit';

// Read-only diagnostic: builder preparation and public RPC reads ONLY. Never
// signs, calls an execution endpoint, or uses a transaction as authorization.
const [java, classpath, wallet] = process.argv.slice(2);
const encode = getAddressEncoder().encode, decode = getAddressDecoder().decode;
if (!java || !classpath || !wallet) throw new Error('Provide java, checker classpath, public wallet address');
encode(wallet);
const program = 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu';
const pool = '5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq';
const custody = '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz';
async function post(url, body, headers = {}) {
  const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Public preparation/read failed: HTTP ${response.status}`);
  const text = await response.text(); if (text.length > 100000) throw new Error('Oversized diagnostic response');
  return JSON.parse(text);
}
const prepared = await post('https://perps-api.jup.ag/v1/positions/increase', {
  asset: 'SOL', inputToken: 'SOL', inputTokenAmount: '100000000', leverage: '2', maxSlippageBps: '50', side: 'long', walletAddress: wallet,
  tpsl: [{ receiveToken: 'USDC', triggerPrice: '95000000', requestType: 'sl' }, { receiveToken: 'USDC', triggerPrice: '110000000', requestType: 'tp' }],
}, { 'x-perps-api-version': 'v2' });
const message = getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(Buffer.from(prepared.serializedTxBase64, 'base64')).messageBytes);
const keys = [...message.staticAccounts], writable = [], readonly = [];
const tables = message.addressTableLookups || [];
if (tables.length) {
  const rpc = await post('https://api.mainnet-beta.solana.com', { jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [tables.map((table) => table.lookupTableAddress), { encoding: 'base64', commitment: 'confirmed' }] });
  assert.equal(rpc.error, undefined); assert.equal(rpc.result.value.length, tables.length);
  for (const [i, table] of tables.entries()) {
    const account = rpc.result.value[i]; assert.equal(account.owner, 'AddressLookupTab1e1111111111111111111111111'); assert.equal(account.executable, false); assert.equal(account.data[1], 'base64');
    const data = Buffer.from(account.data[0], 'base64'); assert.equal(data.readUInt32LE(0), 1); assert.equal(data.readBigUInt64LE(4), (1n << 64n) - 1n);
    const slot = BigInt(rpc.result.context.slot), extended = data.readBigUInt64LE(12); assert.ok(extended <= slot);
    const usable = extended === slot ? data[20] : (data.length - 56) / 32;
    for (const [indexes, target] of [[table.writableIndexes, writable], [table.readonlyIndexes, readonly]]) for (const index of indexes) {
      assert.ok(Number.isInteger(index) && index >= 0 && index < usable); target.push(decode(data.subarray(56 + index * 32, 88 + index * 32)));
    }
  }
}
keys.push(...writable, ...readonly);
const perps = message.instructions.filter((instruction) => keys[instruction.programAddressIndex] === program);
assert.equal(perps.length, 3);
const [open, ...exits] = perps;
assert.equal(open.data.length, 42); assert.equal(open.data[25], 1);
const accounts = (instruction) => instruction.accountIndices.map((index) => keys[index]);
assert.equal(accounts(open)[2], wallet); assert.equal(accounts(open)[7], custody); assert.equal(accounts(open)[10], custody);
const positionSeeds = [Buffer.from('position'), encode(wallet), encode(pool), encode(custody), encode(custody), Buffer.from([1])];
const lines = [`derive ${program} ${positionSeeds.map((seed) => Buffer.from(seed).toString('base64')).join(' ')}`];
const actual = [accounts(open)[6]];
assert.equal(actual[0], prepared.positionPubkey);
for (const exit of exits) {
  const data = Buffer.from(exit.data); assert.equal(data.length, 50); assert.equal(accounts(exit)[6], actual[0]);
  const seeds = [Buffer.from('position_request'), encode(actual[0]), data.subarray(34, 42), Buffer.from([2])];
  lines.push(`derive ${program} ${seeds.map((seed) => Buffer.from(seed).toString('base64')).join(' ')}`); actual.push(accounts(exit)[7]);
}
const checked = spawnSync(java, ['-cp', classpath, 'com.jamddmaj.ai.wallet.SolanaProgramAddressCheck'], { input: `${lines.join('\n')}\n`, encoding: 'utf8', timeout: 30000 });
if (checked.error || checked.status !== 0) throw checked.error || new Error(checked.stderr);
assert.deepEqual(checked.stdout.trim().split(/\r?\n/).map((line) => line.split(':')[0]), actual);
console.log('Live Jupiter preparation: native position and both exit-request PDAs match. Funding, simulation and execution NOT approved. Signed=false submitted=false.');
