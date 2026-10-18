import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { getAddressEncoder, getAddressDecoder, getTransactionDecoder, getCompiledTransactionMessageDecoder } from '@solana/kit';

// Read-only diagnostic: builder preparation and public RPC reads ONLY. Never
// signs, calls an execution endpoint, or uses a transaction as authorization.
const [java, classpath, wallet, mode] = process.argv.slice(2);
if (mode !== undefined && mode !== '--simulate') throw new Error('Unknown diagnostic mode');
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
const nativeTableSnapshots=[];
const tables = message.addressTableLookups || [];
if (tables.length) {
  const rpc = await post('https://api.mainnet-beta.solana.com', { jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [tables.map((table) => table.lookupTableAddress), { encoding: 'base64', commitment: 'confirmed' }] });
  assert.equal(rpc.error, undefined); assert.equal(rpc.result.value.length, tables.length);
  for (const [i, table] of tables.entries()) {
    const account = rpc.result.value[i]; assert.equal(account.owner, 'AddressLookupTab1e1111111111111111111111111'); assert.equal(account.executable, false); assert.equal(account.data[1], 'base64');
    const data = Buffer.from(account.data[0], 'base64'); assert.equal(data.readUInt32LE(0), 1); assert.equal(data.readBigUInt64LE(4), (1n << 64n) - 1n);
    nativeTableSnapshots.push(`${table.lookupTableAddress} ${account.data[0]} ${rpc.result.context.slot}`);
    const slot = BigInt(rpc.result.context.slot), extended = data.readBigUInt64LE(12); assert.ok(extended <= slot);
    const usable = extended === slot ? data[20] : (data.length - 56) / 32;
    for (const [indexes, target] of [[table.writableIndexes, writable], [table.readonlyIndexes, readonly]]) for (const index of indexes) {
      assert.ok(Number.isInteger(index) && index >= 0 && index < usable); target.push(decode(data.subarray(56 + index * 32, 88 + index * 32)));
    }
  }
}
keys.push(...writable, ...readonly);
const oracleBoundary=spawnSync(java,['-cp',classpath,'com.jamddmaj.ai.wallet.NativePerpsOracleBoundaryCheck',wallet,'SOL','1'],{
  input:[prepared.serializedTxBase64,...nativeTableSnapshots].join('\n'),encoding:'utf8',timeout:30000,
});
if(oracleBoundary.error||oracleBoundary.status!==0)throw oracleBoundary.error||new Error(oracleBoundary.stderr);
console.log(oracleBoundary.stdout.trim());
const perps = message.instructions.filter((instruction) => keys[instruction.programAddressIndex] === program);
assert.equal(perps.length, 3);
const [open, ...exits] = perps;
assert.equal(open.data.length, 42); assert.equal(open.data[25], 1);
const accounts = (instruction) => instruction.accountIndices.map((index) => keys[index]);
assert.equal(accounts(open)[2], wallet); assert.equal(accounts(open)[7], custody); assert.equal(accounts(open)[10], custody);
// Resolve oracle/vault identities from the confirmed program-owned custody,
// rather than accepting the builder's account list as its own authority.
const custodyReply=await post('https://api.mainnet-beta.solana.com',{
  jsonrpc:'2.0',id:1,method:'getAccountInfo',params:[custody,{encoding:'base64',commitment:'confirmed'}],
});
assert.equal(custodyReply.error,undefined);const custodyValue=custodyReply.result.value;
assert.equal(custodyValue.data[1],'base64');
const custodyCheck=spawnSync(java,['-cp',classpath,'com.jamddmaj.ai.wallet.NativePerpsCustodyCheck',
  'SOL',custody,custodyValue.owner,String(custodyValue.executable),custodyValue.data[0],...accounts(open)],
  {encoding:'utf8',timeout:30000});
if(custodyCheck.error||custodyCheck.status!==0)throw custodyCheck.error||new Error(custodyCheck.stderr);
console.log(custodyCheck.stdout.trim());
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
if (mode === '--simulate') {
  async function rpc(method, params) {
    const reply = await post('https://api.mainnet-beta.solana.com', { jsonrpc: '2.0', id: 1, method, params });
    assert.equal(reply.error, undefined); return reply.result;
  }
  const height = await rpc('getBlockHeight', [{ commitment: 'confirmed' }]);
  assert.ok(BigInt(height) <= BigInt(prepared.txMetadata.lastValidBlockHeight));
  const transaction = getTransactionDecoder().decode(Buffer.from(prepared.serializedTxBase64, 'base64'));
  const fee = await rpc('getFeeForMessage', [Buffer.from(transaction.messageBytes).toString('base64'), { commitment: 'confirmed' }]);
  assert.ok(fee.value > 0 && fee.value <= 1000000);
  const watched = [...new Set([wallet, actual[0], ...actual.slice(1)])];
  const before = await rpc('getMultipleAccounts', [watched, { commitment: 'confirmed', encoding: 'base64' }]);
  const simulation = await rpc('simulateTransaction', [prepared.serializedTxBase64, {
    encoding: 'base64', commitment: 'confirmed', sigVerify: false, replaceRecentBlockhash: false,
    minContextSlot: before.context.slot, accounts: { encoding: 'base64', addresses: watched },
  }]);
  assert.equal(simulation.value.err, null, `Unsigned simulation failed: ${JSON.stringify(simulation.value.err)}`);
  assert.ok(simulation.value.unitsConsumed > 0 && simulation.value.unitsConsumed <= 1400000);
  assert.equal(simulation.value.accounts.length, watched.length);
  const position = simulation.value.accounts[1]; assert.equal(position.owner, program); assert.equal(position.executable, false);
  const data = Buffer.from(position.data[0], 'base64');
  for (let i = 0; i < exits.length; i++) {
    const request = simulation.value.accounts[i + 2];
    assert.equal(request.owner, program); assert.equal(request.executable, false);
    const checkedExit = spawnSync(java, ['-cp', classpath, 'com.jamddmaj.ai.wallet.NativePerpsExitRequestCheck',
      actual[i + 1], wallet, 'SOL', '1', request.owner, String(request.executable), request.data[0], Buffer.from(exits[i].data).toString('base64')], { encoding: 'utf8', timeout: 30000 });
    if (checkedExit.error || checkedExit.status !== 0) throw checkedExit.error || new Error(checkedExit.stderr);
    console.log(checkedExit.stdout.trim());
  }
  const nativePosition = spawnSync(java, ['-cp', classpath, 'com.jamddmaj.ai.wallet.NativePerpsPositionCheck',
    actual[0], wallet, 'SOL', '1', position.owner, String(position.executable), position.data[0]], { encoding: 'utf8', timeout: 30000 });
  if (nativePosition.error || nativePosition.status !== 0) throw nativePosition.error || new Error(nativePosition.stderr);
  console.log(nativePosition.stdout.trim());
  console.log(JSON.stringify({
    diagnosticInputToken: 'SOL', productionUsdcFundingVerified: false, slot: simulation.context.slot,
    feeLamports: fee.value, unitsConsumed: simulation.value.unitsConsumed,
    existingPosition: before.value[1] !== null, simulatedPositionPrefixHex: data.subarray(0, 210).toString('hex'),
    simulatedSizeUsdUnits: data.readBigUInt64LE(161).toString(), simulatedCollateralUsdUnits: data.readBigUInt64LE(169).toString(),
    signedByUser: false, submitted: false, tradingApproved: false,
  }));
}
