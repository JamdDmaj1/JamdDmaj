// Read-only snapshot. Does not prove vesting integration or absence of spending limits.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';
import bs58 from 'bs58';

const plan = JSON.parse(await readFile(new URL('../security/jamd-allocation-plan.json', import.meta.url), 'utf8'));
const governance = JSON.parse(await readFile(new URL('../security/mainnet-governance-plan.json', import.meta.url), 'utf8'));
const expected = governance.operationsMultisig.replacementPlan;
const PROGRAM = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf';
if (plan.custody.programAddress !== PROGRAM || plan.custody.multisigAddress !== expected.address) throw Error('Governance plans disagree');
const response = await fetch('https://api.mainnet-beta.solana.com', {
  method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(15000),
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',params:[expected.address,{encoding:'base64',commitment:'finalized'}]})
});
if (!response.ok) throw Error(`RPC HTTP ${response.status}`);
const json = await response.json();
const account = json.result?.value;
if (json.error || !account || account.owner !== PROGRAM || account.executable) throw Error('Invalid multisig account or RPC error');
const data = Buffer.from(account.data[0], 'base64');
const discriminator = createHash('sha256').update('account:Multisig').digest().subarray(0,8);
if (data.length < 100 || !data.subarray(0,8).equals(discriminator)) throw Error('Invalid Multisig layout');
const threshold = data.readUInt16LE(72);
const timeLockSeconds = data.readUInt32LE(74);
const autonomous = data.subarray(40,72).every(v=>v===0);
let offset=94;
const rentOption=data[offset++];
if (rentOption===1) offset+=32;
else if (rentOption!==0) throw Error('Invalid rent collector option');
offset++;
if(offset+4>data.length) throw Error('Truncated members');
const count=data.readUInt32LE(offset); offset+=4;
if(count!==3 || offset+count*33>data.length) throw Error('Unexpected member count');
const members=[];
for(let i=0;i<count;i++) {
  members.push({address:bs58.encode(data.subarray(offset,offset+32)),permissions:data[offset+32]}); offset+=33;
}
const expectedMembers=[expected.ownerAddress,...expected.cosignerCandidates.map(m=>m.address)].sort();
const actualMembers=members.map(m=>m.address).sort();
const vaults=[];
for(const allocation of plan.allocations) {
  if(!Number.isInteger(allocation.vaultIndex)||allocation.vaultIndex<0||allocation.vaultIndex>255) throw Error('Invalid vault index');
  const [derived]=await getProgramDerivedAddress({programAddress:PROGRAM,seeds:[
    new TextEncoder().encode('multisig'),getAddressEncoder().encode(expected.address),
    new TextEncoder().encode('vault'),new Uint8Array([allocation.vaultIndex])
  ]});
  vaults.push({category:allocation.category,address:derived,matches:derived===allocation.beneficiary});
}
const checks={
  membersMatch:JSON.stringify(expectedMembers)===JSON.stringify(actualMembers),
  memberPermissions:members.every(m=>m.permissions===7),
  autonomous,
  threshold:threshold===2 && threshold===expected.threshold,
  timelock:timeLockSeconds===expected.timeLockSeconds && timeLockSeconds>=86400,
  vaults:vaults.length===5 && new Set(vaults.map(v=>v.address)).size===5 && vaults.every(v=>v.matches)
};
const passed=Object.values(checks).every(Boolean);
console.log(JSON.stringify({scope:'read-only-governance-snapshot',network:'solana-mainnet-beta',
  multisigAddress:expected.address,slot:json.result.context.slot,commitment:'finalized',
  passed,checks,threshold,timeLockSeconds,members,vaults,
  vestingIntegrationVerified:false,spendingLimitsVerified:false,sentTransactions:0},null,2));
if(!passed) process.exitCode=1;
