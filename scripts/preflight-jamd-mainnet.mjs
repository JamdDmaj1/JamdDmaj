// Read-only report. No transaction construction, signing, or broadcast.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateReadiness } from '../lib/mainnet-readiness.js';
import { JAMDDMAJ_LOCK_PROGRAM_ADDRESS } from '../lib/solana-devnet-token.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [intent, allocation, readiness, integration] = await Promise.all([
  read('../security/jamd-mainnet-intent.json'), read('../security/jamd-allocation-plan.json'),
  read('../security/mainnet-readiness.json'), read('../security/squads-vesting-integration-evidence.json')
]);
const governance = JSON.parse(execFileSync(process.execPath,
  [fileURLToPath(new URL('./verify-jamd-governance.mjs', import.meta.url))],
  {encoding:'utf8',timeout:30000}));
const response = await fetch('https://api.mainnet-beta.solana.com', {
  method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(15000),
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',params:[JAMDDMAJ_LOCK_PROGRAM_ADDRESS,{encoding:'base64',commitment:'finalized'}]})
});
if(!response.ok)throw Error(`RPC HTTP ${response.status}`);
const json=await response.json();
if(json.error||!json.result)throw Error('Program RPC check failed');
const account=json.result.value;
const checks={
  governance:governance.passed===true,
  allocationsMatch:allocation.allocations.length===intent.allocation.length && allocation.allocations.every(row=>{
    const target=intent.allocation.find(a=>a.category===row.category);
    return target && row.totalTokens===target.tokens &&
      BigInt(row.lockedTokens)===(BigInt(target.tokens)*BigInt(target.lockedBps)+9999n)/10000n &&
      BigInt(row.lockedTokens)+BigInt(row.notVestedTokens)===BigInt(row.totalTokens);
  }),
  localIntegration:integration.status==='passed' && integration.scope==='local-litesvm-with-ephemeral-signers',
  programExecutable:account?.executable===true,
  mintAssigned:typeof intent.token.mintAddress==='string' && intent.token.mintAddress.length>0
};
const documented=evaluateReadiness(readiness);
console.log(JSON.stringify({
  scope:'read-only-mainnet-preflight',network:'solana-mainnet-beta',
  checkedSlots:{governance:governance.slot,program:json.result.context.slot},checks,
  lockProgram:{address:JAMDDMAJ_LOCK_PROGRAM_ADDRESS,exists:account!==null,owner:account?.owner??null,
    deployedBinaryMatchesTestedBinary:null,upgradeAuthorityVerified:false},
  documentaryReadiness:documented,
  launchReady:false,
  unresolved:[
    ...(!checks.programExecutable?['lock-program-not-deployed-at-configured-address']:[]),
    'deployed-binary-and-upgrade-authority-not-verified',
    'mint-creation-and-complete-distribution-flow-not-yet-validated',
    'final-network-fees-not-quoted',
    'spending-limit-accounts-not-reviewed',
    ...documented.incomplete.map(item=>item.name)
  ],
  notes:['Local integration evidence does not constitute Mainnet deployment or external approval.'],
  networkTransactionsSent:0
},null,2));
if(process.argv.includes('--enforce'))process.exitCode=1;
