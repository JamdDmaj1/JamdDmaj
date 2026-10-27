import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import bs58 from 'bs58';
import {createRecipientSetupProtocol,setupBase64} from '../lib/fee-recipient-setup-protocol.js';
import {createFeeRecipientSetupService} from '../lib/fee-recipient-setup-service.js';
import {createFeeRecipientSetupHandler} from '../lib/fee-recipient-setup-http.js';
import {setupFeeRecipientSetupPage} from '../lib/fee-recipient-setup-page.js';
import {PERPS_PLATFORM_FEE as FEE} from '../lib/perps-platform-fee.js';
const at=Date.parse('2026-10-25T12:00:00Z');
async function fixture(){
 // Public deterministic, unfunded fixture only. No live wallet/provider/RPC.
 const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,99)]),format:'der',type:'pkcs8'});
 const pub=createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32),owner=bs58.encode(pub),protocol=createRecipientSetupProtocol({recipient:owner,mint:FEE.mint});
 const blockhash=bs58.encode(Buffer.alloc(32,8)),compiled=await protocol.compileRecipientSetupMessage(blockhash),unsigned=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),compiled.message]);
 const packet=Object.freeze({stage:'UNSIGNED_FEE_RECIPIENT_USDC_SETUP',network:'solana-mainnet',owner,mint:FEE.mint,destination:compiled.destination,payer:owner,
  preparedAt:at,reviewExpiresAt:at+60000,observedSlot:100,blockhash,lastValidBlockHeight:200,
  operatorBalanceLamports:'5000000',rentReserveLamports:'1488440',networkFeeLamports:'5000',estimatedTotalLamports:'1493440',serializedTxBase64:unsigned.toString('base64'),
  messageSha256:createHash('sha256').update(compiled.message).digest('hex'),operation:'CREATE_ASSOCIATED_USDC_ACCOUNT_IDEMPOTENT',usdcTransferredUnits:'0',requiresFreshWalletReview:true,readyForSigning:false,signed:false,submitted:false});
 const signed=Buffer.concat([Buffer.from([1]),sign(null,compiled.message,privateKey),compiled.message]).toString('base64');
 const state={exists:false,pending:false,failed:false,timeout:false,invalidBlockhash:false,badEffects:false,sends:0,prompts:0};
 const token=Buffer.alloc(165);Buffer.from(bs58.decode(FEE.mint)).copy(token,0);pub.copy(token,32);token[108]=1;
 const ata={owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',executable:false,lamports:1488440,data:[token.toString('base64'),'base64']};
 const calls=[];
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='isBlockhashValid')return {context:{slot:100},value:!state.invalidBlockhash};
  if(method==='simulateTransaction')return {context:{slot:100},value:{err:null,accounts:[{owner:'11111111111111111111111111111111',executable:false,lamports:3506560+(state.badEffects?1:0),data:['','base64']},ata]}};
  if(method==='sendTransaction'){state.sends++;assert.equal(params[0],signed);assert.equal(params[1].maxRetries,0);state.exists=true;if(state.timeout)throw Error('TIMEOUT');return bs58.encode(Buffer.from(signed,'base64').subarray(1,65));}
  if(method==='getAccountInfo')return {context:{slot:200},value:state.exists?ata:null};
  if(method==='getSignatureStatuses')return {context:{slot:200},value:[state.pending?null:{slot:200,confirmationStatus:'finalized',err:state.failed?{InstructionError:[0,'Custom']}:null}]};
  if(method==='getTransaction')return {slot:200,transaction:[signed,'base64'],meta:{err:state.failed?{InstructionError:[0,'Custom']}:null}};
  assert.fail('UNEXPECTED_RPC_'+method);
 };
 const prepare=async()=>state.exists?{stage:'FEE_RECIPIENT_USDC_ALREADY_EXISTS',owner,mint:FEE.mint,destination:compiled.destination}:packet;
 const service=createFeeRecipientSetupService({request,now:()=>at,protocol,prepare});
 const handler=createFeeRecipientSetupHandler({service,rateLimit:async()=>{}});
 return {protocol,packet,signed,service,handler,state,calls,owner,pub,privateKey};
}
test('canonical setup validates a fixture owner signature but rejects changed payer, cost and message',async()=>{
 const f=await fixture();await f.protocol.validateRecipientSetupPacket(f.packet,{now:at});
 assert.equal((await f.protocol.validateSignedRecipientSetup(f.packet,f.signed,{now:at})).destination,f.packet.destination);
 for(const patch of [{payer:FEE.recipient},{destination:FEE.recipient},{estimatedTotalLamports:'1'},{networkFeeLamports:'10001'},{usdcTransferredUnits:'1'}])await assert.rejects(f.protocol.validateSignedRecipientSetup({...f.packet,...patch},f.signed,{now:at}));
 const bad=Buffer.from(f.signed,'base64');bad[80]^=1;await assert.rejects(f.protocol.inspectSignedRecipientSetup(bad.toString('base64')));
});
test('setup HTTP reaches exact owner-signed RPC submission once and read-only finalized recovery',async()=>{
 const f=await fixture();let response=await f.handler(new Request('https://www.jamddmaj.com/api/fee-recipient-setup'));
 assert.equal(response.status,200);assert.equal(f.state.sends,0);
 response=await f.handler(new Request('https://www.jamddmaj.com/api/fee-recipient-setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit',packet:f.packet,signedBase64:f.signed,explicitApproval:true})}));
 const result=(await response.json()).result;assert.equal(result.stage,'RECIPIENT_SETUP_SUBMITTED');assert.equal(f.state.sends,1);assert.equal(result.accountReady,false);
 const recovered=await f.service.recover(result.signature);assert.equal(recovered.stage,'RECIPIENT_SETUP_CONFIRMED');assert.equal(recovered.accountReady,true);assert.equal(f.state.sends,1);
 await f.service.submit({packet:f.packet,signedBase64:f.signed,explicitApproval:true});assert.equal(f.state.sends,1,'idempotent account already exists; do not send again');
});
test('bad signature, blockhash and simulation cannot invoke the setup broadcaster',async()=>{
 for(const flag of ['signature','invalidBlockhash','badEffects']){
  const f=await fixture();if(flag!=='signature')f.state[flag]=true;const wire=Buffer.from(f.signed,'base64');if(flag==='signature')wire[3]^=1;
  await assert.rejects(f.service.submit({packet:f.packet,signedBase64:wire.toString('base64'),explicitApproval:true}));assert.equal(f.state.sends,0);
 }
});
test('timeout preserves uncertainty and does not retry the send',async()=>{
 const f=await fixture();f.state.timeout=true;f.state.pending=true;
 const result=await f.service.submit({packet:f.packet,signedBase64:f.signed,explicitApproval:true});assert.equal(result.stage,'RECIPIENT_SETUP_UNCONFIRMED');assert.equal(f.state.sends,1);
 assert.equal((await f.service.recover(result.signature)).stage,'RECIPIENT_SETUP_UNCONFIRMED');assert.equal(f.state.sends,1);
});
test('HTTP rejects foreign origins, extra fields and missing explicit approval before any submission',async()=>{
 const f=await fixture();
 for(const input of [{action:'submit',packet:f.packet,signedBase64:f.signed},{action:'submit',packet:f.packet,signedBase64:f.signed,explicitApproval:true,recipient:'foreign'},{action:'sendTransaction',signedBase64:f.signed}]){
  const r=await f.handler(new Request('https://www.jamddmaj.com/api/fee-recipient-setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));assert.equal(r.status,400);
 }
 const denied=await f.handler(new Request('https://www.jamddmaj.com/api/fee-recipient-setup',{headers:{Origin:'https://attacker.example'}}));assert.equal(denied.status,403);assert.equal(f.state.sends,0);
});
function domFixture(){
 const elements=new Map();const node=()=>({children:[],value:'',checked:false,textContent:'',disabled:false,hidden:false,append(...n){this.children.push(...n);},replaceChildren(){this.children=[];},setAttribute(){}});
 const doc={hidden:false,visibilityState:'visible',hasFocus:()=>true,getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id);},createElement:node,addEventListener(){}};
 return {doc,elements};
}
test('page + Wallet Standard + HTTP uses explicit approval and exposes finalized outcome without double signing',async()=>{
 const f=await fixture(),{doc}=domFixture(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const account={address:f.owner,publicKey:new Uint8Array(f.pub),chains:['solana:mainnet'],features:['solana:signTransaction']};
 const wallet={name:'Phantom',accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signTransaction':{supportedTransactionVersions:['legacy'],signTransaction:async input=>{f.state.prompts++;assert.equal(input.chain,'solana:mainnet');return [{signedTransaction:Uint8Array.from(Buffer.from(f.signed,'base64'))}];}}}};
 const registry={get:()=>[wallet],on(){return ()=>{};}};
 const page=setupFeeRecipientSetupPage({doc,registry,storage,locks:{request:(_name,_opts,fn)=>fn({})},now:()=>at,protocol:f.protocol,
  fetchImpl:(url,options)=>f.handler(new Request('https://www.jamddmaj.com'+url,options))});
 const el=page.elements;el.wallets.value='0';assert.equal(f.state.prompts,0);assert.equal(f.state.sends,0);
 await el.connect.onclick();await el.prepare.onclick();assert.match(el.summary.textContent,/0\.00149344 SOL/);assert.equal(el.confirm.disabled,true);
 await el.confirm.onclick();assert.equal(f.state.prompts,0);el.consent.checked=true;el.consent.onchange();assert.equal(el.confirm.disabled,false);
 await el.confirm.onclick();assert.equal(f.state.prompts,1);assert.equal(f.state.sends,1);assert.equal(el.confirm.disabled,true);
 await el.recover.onclick();assert.match(el.status.textContent,/operación finalizada/);assert.equal(values.size,0);
});

async function approvalScenario(kind){
 const f=await fixture(),{doc}=domFixture(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let clock=at,focused=true,focusWaits=0;doc.hasFocus=()=>focused;
 const account={address:f.owner,publicKey:new Uint8Array(f.pub),chains:['solana:mainnet'],features:['solana:signTransaction']};
 const wallet={name:'Phantom',accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signTransaction':{supportedTransactionVersions:['legacy'],signTransaction:async()=>{
  f.state.prompts++;if(kind==='expired')clock=at+60000;
  if(['focus-return','focus-missing','hidden','changed-account'].includes(kind))focused=false;
  if(kind==='hidden')doc.hidden=true;
  const wire=Uint8Array.from(Buffer.from(f.signed,'base64'));
  return [{signedTransaction:kind==='changed-wire'?new Uint8Array([...wire,0]):wire}];
 }}}};
 const registry={get:()=>[wallet],on(){return ()=>{};}};
 const page=setupFeeRecipientSetupPage({doc,registry,storage,locks:{request:(_name,_opts,fn)=>fn({})},now:()=>clock,protocol:f.protocol,
  waitForFocus:async()=>{focusWaits++;if(kind==='focus-return'||kind==='changed-account')focused=true;if(kind==='changed-account')wallet.accounts=[];},
  fetchImpl:(url,options)=>f.handler(new Request('https://www.jamddmaj.com'+url,options))});
 const el=page.elements;el.wallets.value='0';await el.connect.onclick();await el.prepare.onclick();el.consent.checked=true;el.consent.onchange();await el.confirm.onclick();
 return {f,el,values,focusWaits};
}
test('extension focus lag waits for foreground and submits only the exact approved signature once',async()=>{
 const {f,el,focusWaits}=await approvalScenario('focus-return');assert.equal(focusWaits,1);assert.equal(f.state.prompts,1);assert.equal(f.state.sends,1);
 await el.recover.onclick();assert.match(el.status.textContent,/operación finalizada/);assert.equal(f.state.sends,1);
});
for(const [kind,message]of [['expired',/La revisión venció/],['changed-wire',/SETUP_WALLET_TRANSACTION_CHANGED/],['focus-missing',/SETUP_FOCUS_NOT_RETURNED/],['hidden',/SETUP_FOCUS_NOT_RETURNED/],['changed-account',/La cuenta o la revisión cambió/]])test('approval safely retains the exact reason without submission: '+kind,async()=>{
 const {f,el,values}=await approvalScenario(kind);assert.equal(f.state.prompts,1);assert.equal(f.state.sends,0);assert.match(el.status.textContent,message);
 await el.recover.onclick();assert.match(el.status.textContent,message);assert.equal(f.state.sends,0);assert.equal(f.state.prompts,1);
 assert.equal(JSON.parse([...values.values()][0]).stage,'SIGNING');await el.discard.onclick();assert.equal(values.size,0);
});
