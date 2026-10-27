import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {readFileSync} from 'node:fs';
import {preparePerpsFeeRecipientSetup} from '../lib/perps-fee-recipient-setup.js';
import {PERPS_PLATFORM_FEE as fee} from '../lib/perps-platform-fee.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
function fixture(change={}){
 const calls=[],rent=1488440,network=8000,ownerSol=75610623;
 const account=(owner,data,lamports)=>({owner,executable:false,lamports,data:[data.toString('base64'),'base64']});
 const payer=after=>account('11111111111111111111111111111111',Buffer.alloc(0),ownerSol-(after?rent+network:0));
 const mint=Buffer.alloc(82);mint[44]=6;mint[45]=1;
 const token=Buffer.alloc(165);Buffer.from(bs58.decode(fee.mint)).copy(token,0);Buffer.from(bs58.decode(fee.recipient)).copy(token,32);token[108]=1;
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return change.genesis??'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getMultipleAccounts')return {context:{slot:100},value:[change.noFunds?account('11111111111111111111111111111111',Buffer.alloc(0),0):payer(false),account(TOKEN,mint,1000000),change.exists?account(TOKEN,token,rent):null]};
  if(method==='getLatestBlockhash')return {context:{slot:100},value:{blockhash:bs58.encode(Buffer.alloc(32,8)),lastValidBlockHeight:200}};
  if(method==='getMinimumBalanceForRentExemption')return rent;
  if(method==='getFeeForMessage')return {context:{slot:100},value:network};
  if(method==='simulateTransaction'){
   assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);
   const result={context:{slot:100},value:{err:null,accounts:[payer(true),account(TOKEN,Buffer.from(token),rent)]}};
   change.mutate?.(result);return result;
  }
  assert.fail('must not sign or send: '+method);
 };return {calls,request};
}
test('operator-only preparation builds fixed compute budget and one unsigned idempotent USDC account creation, with simulated exact costs',async()=>{
 const f=fixture(),p=await preparePerpsFeeRecipientSetup({request:f.request,now:()=>100000});
 assert.equal(p.owner,fee.recipient);assert.equal(p.payer,fee.recipient);assert.equal(p.destination,'AKyJkfAEqmPMCbKRFmtdYzkHry3oJjPxtZFathpSwKNL');
 assert.equal(p.usdcTransferredUnits,'0');assert.equal(p.estimatedTotalLamports,'1496440');assert.equal(p.readyForSigning,false);assert.equal(p.submitted,false);
 const wire=Buffer.from(p.serializedTxBase64,'base64');assert.equal(wire.length,356);assert.equal(wire[0],1);assert.ok(wire.subarray(1,65).every(v=>v===0));assert.deepEqual([...wire.subarray(-31)],[3,6,0,5,2,160,134,1,0,6,0,9,3,48,117,0,0,0,0,0,0,5,6,0,1,0,2,3,4,1,1]);
 assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
});
test('an existing valid USDC account produces no new creation transaction or fee request',async()=>{
 const f=fixture({exists:true}),p=await preparePerpsFeeRecipientSetup({request:f.request});
 assert.equal(p.stage,'FEE_RECIPIENT_USDC_ALREADY_EXISTS');assert.equal(p.serializedTxBase64,undefined);assert.equal(f.calls.some(c=>c.method==='getFeeForMessage'),false);
});
test('wrong chain, insufficient operator SOL and incorrect effects block preparation',async()=>{
 for(const change of [{genesis:'wrong'},{noFunds:true},{mutate:r=>{r.value.err={InstructionError:[0,'Custom']};}},
  {mutate:r=>{r.value.accounts[0].lamports+=1;}},{mutate:r=>{r.value.accounts[1].lamports+=1;}},
  {mutate:r=>{r.value.accounts[1].data[0]=Buffer.alloc(165).toString('base64');}}]){
  const f=fixture(change);await assert.rejects(preparePerpsFeeRecipientSetup({request:f.request}));assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
 }
});
test('the preparation CLI has a read-only RPC allowlist and creates no signing or submission capability',()=>{
 const source=readFileSync(new URL('../scripts/prepare-fee-recipient-setup.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/sendTransaction|signTransaction|privateKey|process\.env/);assert.match(source,/flag:'wx'/);assert.match(source,/READ_ONLY_SETUP_RPC_REQUIRED/);
});
