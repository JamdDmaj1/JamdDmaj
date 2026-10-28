import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import bs58 from 'bs58';
import {createRecipientSetupProtocol,setupBase64} from '../lib/fee-recipient-setup-protocol.js';
import {createFeeRecipientSetupService} from '../lib/fee-recipient-setup-service.js';
import {createFeeRecipientSetupHandler} from '../lib/fee-recipient-setup-http.js';
import {setupFeeRecipientSetupPage} from '../lib/fee-recipient-setup-page.js';
import {PERPS_PLATFORM_FEE as FEE} from '../lib/perps-platform-fee.js';
import {SETUP_LIGHTHOUSE,parseSetupSignedMessage,setupInstructionSummary} from '../lib/fee-recipient-setup-guards.js';
const at=Date.parse('2026-10-25T12:00:00Z');
async function fixture(){
 // Public deterministic, unfunded fixture only. No live wallet/provider/RPC.
 const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,99)]),format:'der',type:'pkcs8'});
 const pub=createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32),owner=bs58.encode(pub),protocol=createRecipientSetupProtocol({recipient:owner,mint:FEE.mint});
 const blockhash=bs58.encode(Buffer.alloc(32,8)),compiled=await protocol.compileRecipientSetupMessage(blockhash),unsigned=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),compiled.message]);
 const packet=Object.freeze({stage:'UNSIGNED_FEE_RECIPIENT_USDC_SETUP',network:'solana-mainnet',owner,mint:FEE.mint,destination:compiled.destination,payer:owner,
  preparedAt:at,reviewExpiresAt:at+60000,observedSlot:100,blockhash,lastValidBlockHeight:200,
  operatorBalanceLamports:'5000000',rentReserveLamports:'1488440',networkFeeLamports:'8000',estimatedTotalLamports:'1496440',serializedTxBase64:unsigned.toString('base64'),
  messageSha256:createHash('sha256').update(compiled.message).digest('hex'),operation:'CREATE_ASSOCIATED_USDC_ACCOUNT_IDEMPOTENT',usdcTransferredUnits:'0',requiresFreshWalletReview:true,readyForSigning:false,signed:false,submitted:false});
 const signed=Buffer.concat([Buffer.from([1]),sign(null,compiled.message,privateKey),compiled.message]).toString('base64');
 const state={exists:false,pending:false,failed:false,timeout:false,invalidBlockhash:false,badEffects:false,sends:0,prompts:0,signedWire:signed};
 const token=Buffer.alloc(165);Buffer.from(bs58.decode(FEE.mint)).copy(token,0);pub.copy(token,32);token[108]=1;
 const ata={owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',executable:false,lamports:1488440,data:[token.toString('base64'),'base64']};
 const calls=[];
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='isBlockhashValid')return {context:{slot:100},value:!state.invalidBlockhash};
  if(method==='simulateTransaction')return {context:{slot:100},value:{err:null,accounts:[{owner:'11111111111111111111111111111111',executable:false,lamports:3503560+(state.badEffects?1:0),data:['','base64']},ata]}};
  if(method==='sendTransaction'){state.sends++;assert.equal(params[0],state.signedWire);assert.equal(params[1].maxRetries,0);state.exists=true;if(state.timeout)throw Error('TIMEOUT');return bs58.encode(Buffer.from(state.signedWire,'base64').subarray(1,65));}
  if(method==='getAccountInfo')return {context:{slot:200},value:state.exists?ata:null};
  if(method==='getSignatureStatuses')return {context:{slot:200},value:[state.pending?null:{slot:200,confirmationStatus:'finalized',err:state.failed?{InstructionError:[0,'Custom']}:null}]};
  if(method==='getTransaction')return {slot:200,transaction:[state.signedWire,'base64'],meta:{err:state.failed?{InstructionError:[0,'Custom']}:null}};
  assert.fail('UNEXPECTED_RPC_'+method);
 };
 const prepare=async()=>state.exists?{stage:'FEE_RECIPIENT_USDC_ALREADY_EXISTS',owner,mint:FEE.mint,destination:compiled.destination}:packet;
 const service=createFeeRecipientSetupService({request,now:()=>at,protocol,prepare});
 const handler=createFeeRecipientSetupHandler({service,rateLimit:async()=>{}});
 return {protocol,packet,signed,service,handler,state,calls,owner,pub,privateKey};
}

// Independent byte-level permutation fixture, not the protocol compiler.
function reorderedFixtureWire(f,order){
 const wire=Buffer.from(f.signed,'base64'),keys=Array.from({length:7},(_,i)=>Buffer.from(wire.subarray(69+i*32,101+i*32))),indices=[0,1,...order];
 assert.equal(new Set(indices).size,7);for(let i=0;i<7;i++)keys[indices[i]].copy(wire,69+i*32);
 let p=325;assert.equal(wire[p++],3);for(let i=0;i<3;i++){
  wire[p]=indices.indexOf(wire[p]);p++;const accounts=wire[p++];for(let j=0;j<accounts;j++){wire[p]=indices.indexOf(wire[p]);p++;}const bytes=wire[p++];p+=bytes;
 }
 assert.equal(p,wire.length);sign(null,wire.subarray(65),f.privateKey).copy(wire,1);return wire.toString('base64');
}
function permutations(values){if(!values.length)return [[]];return values.flatMap((value,i)=>permutations(values.filter((_,j)=>j!==i)).map(tail=>[value,...tail]));}
function versionedFixtureWire(f,encoded=f.signed){
 const wire=Buffer.from(encoded,'base64'),message=Buffer.concat([Buffer.from([128]),wire.subarray(65),Buffer.from([0])]);
 return Buffer.concat([Buffer.from([1]),sign(null,message,f.privateKey),message]).toString('base64');
}
function guardedFixtureWire(f,{versioned=false,guards,mutate}={}){
 const original=Buffer.from(f.signed,'base64'),u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return [...b];};
 guards??=[{program:7,accounts:[0],data:[6,1,2,0,...u64(3503560),0,1,...u64(0),0]},
  {program:7,accounts:[1],data:[10,1,4,2,...u64(0),0,3,0,0,4,1,0,8]}];
 const fixed=Buffer.from(original.subarray(325));fixed[0]=3+guards.length;
 let message=Buffer.concat([Buffer.from([1,0,6,8]),original.subarray(69,293),Buffer.from(bs58.decode(SETUP_LIGHTHOUSE)),original.subarray(293,325),fixed,
  ...guards.map(ix=>Buffer.from([ix.program,ix.accounts.length,...ix.accounts,ix.data.length,...ix.data]))]);
 if(mutate)message=mutate(message);
 if(versioned)message=Buffer.concat([Buffer.from([128]),message,Buffer.from([0])]);
 return Buffer.concat([Buffer.from([1]),sign(null,message,f.privateKey),message]).toString('base64');
}
test('439-byte guarded setup preserves the exact three core instructions and only appends read-only assertions',async()=>{
 const f=await fixture();for(const versioned of [false,true]){
  const encoded=guardedFixtureWire(f,{versioned}),wire=Buffer.from(encoded,'base64');assert.equal(wire.length,versioned?441:439);
  const checked=await f.protocol.validateSignedRecipientSetup(f.packet,encoded,{now:at});assert.equal(checked.guards,2);assert.equal(checked.versioned,versioned);
  assert.equal(checked.destination,f.packet.destination);assert.equal(checked.blockhash,f.packet.blockhash);
 }
});
test('guard compatibility never permits memory writes, extra programs/accounts, CPI logging, changed core instructions or costs',async()=>{
 const f=await fixture();const guard=(kind=6,log=1,target=0,data=[1,0,...Array(8).fill(0),0])=>({program:7,accounts:[target],data:[kind,log,...data]});
 for(const guards of [[guard(0)],[guard(1)],[guard(2)],[guard(6,3)],[guard(6,6)],[guard(6,1,2)],
  [{...guard(),program:3}],[{...guard(),accounts:[0,1]}],[guard(6,1,0,[129])],[guard(6,1,0,[1,8])],
  [guard(6,1,0,[1,0,...Array(8).fill(0),0,0])],[guard(10,1,0,[1,2,...Array(8).fill(0),0])]]){
  await assert.rejects(f.protocol.validateSignedRecipientSetup(f.packet,guardedFixtureWire(f,{guards}),{now:at}));
 }
 for(const offset of [0,1,2,3,4,36,68,228,260,293,300,308,316]){
  await assert.rejects(f.protocol.validateSignedRecipientSetup(f.packet,guardedFixtureWire(f,{mutate:message=>{message[offset]^=1;return message;}}),{now:at}));
 }
 for(const flag of ['badEffects','invalidBlockhash']){const g=await fixture();g.state[flag]=true;g.state.signedWire=guardedFixtureWire(g);await assert.rejects(g.service.submit({packet:g.packet,signedBase64:g.state.signedWire,explicitApproval:true}));assert.equal(g.state.sends,0);}
});
test('guarded signed flow submits once and reconciles the exact signature without replacing wallet safeguards',async()=>{
 const f=await fixture();f.state.signedWire=guardedFixtureWire(f);const result=await f.service.submit({packet:f.packet,signedBase64:f.state.signedWire,explicitApproval:true});assert.equal(f.state.sends,1);
 assert.equal((await f.service.recover(result.signature)).stage,'RECIPIENT_SETUP_CONFIRMED');assert.equal(f.state.sends,1);
 const parsed=parseSetupSignedMessage(Buffer.from(f.state.signedWire,'base64'));assert.deepEqual(parsed.instructions.slice(3).map(ix=>ix.data[0]),[6,10]);
});
test('guard failure-only log ordinals 4/5 preserve the exact 26/17-byte assertion guards from the reported shape',async()=>{
 const f=await fixture(),u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return [...b];};
 for(const log of [0,1,2,4,5]){
  const guards=[{program:7,accounts:[0],data:[6,log,3,0,...u64(3503560),4,1,...u64(0),0,7,0,0]},
   {program:7,accounts:[1],data:[10,log,3,2,...u64(0),4,4,1,0,8]}];
  const encoded=guardedFixtureWire(f,{guards});assert.equal(Buffer.from(encoded,'base64').length,439);
  assert.equal((await f.protocol.validateSignedRecipientSetup(f.packet,encoded,{now:at})).guards,2);
  guards[0].data.splice(-3,3,3,0,0); // KnownOwner(System) == true; same bounded 26 bytes.
  assert.equal((await f.protocol.validateSignedRecipientSetup(f.packet,guardedFixtureWire(f,{guards}),{now:at})).guards,2);
 }
 for(const log of [3,6,16,17,255]){
  const encoded=guardedFixtureWire(f,{guards:[{program:7,accounts:[0],data:[6,log,1,7,0,0]}]});
  await assert.rejects(f.protocol.validateSignedRecipientSetup(f.packet,encoded,{now:at}));
 }
});
test('guard diagnostics contain only public program IDs and bounded structural numbers, never signed data',async()=>{
 const f=await fixture(),wire=Buffer.from(guardedFixtureWire(f),'base64'),summary=setupInstructionSummary(wire);
 assert.equal(summary.length,5);assert.equal(summary[3].program,SETUP_LIGHTHOUSE);assert.equal(summary[3].opcode,6);
 for(const ix of summary)assert.deepEqual(Object.keys(ix),['program','opcode','bytes','accounts',...ix.program===SETUP_LIGHTHOUSE?['log']:[]]);
 const text=JSON.stringify(summary);assert.ok(!text.includes(f.owner));assert.ok(!text.includes(f.packet.blockhash));assert.ok(!text.includes(wire.toString('base64')));
 for(let length=0;length<wire.length;length++)assert.deepEqual(setupInstructionSummary(wire.subarray(0,length)),[]);
});

test('v0 with no lookups preserves the exact fixed recipe through all 120 readonly orderings',async()=>{
 const f=await fixture();for(const order of permutations([2,3,4,5,6])){
  const encoded=versionedFixtureWire(f,reorderedFixtureWire(f,order)),checked=await f.protocol.validateSignedRecipientSetup(f.packet,encoded,{now:at});
  assert.equal(checked.versioned,true);assert.equal(checked.legacy,false);assert.equal(checked.blockhash,f.packet.blockhash);assert.equal(checked.destination,f.packet.destination);
 }
});
test('v0 cannot introduce lookups, extra instructions, changed permissions, fees, owner or blockhash',async()=>{
 const f=await fixture(),original=Buffer.from(versionedFixtureWire(f),'base64');
 for(const offset of [65,66,67,68,70,102,134,294,326,327,330,334,338,346,357]){
  const wire=Buffer.from(original);wire[offset]^=1;sign(null,wire.subarray(65),f.privateKey).copy(wire,1);
  await assert.rejects(f.protocol.validateSignedRecipientSetup(f.packet,wire.toString('base64'),{now:at}));
 }
 const extra=Buffer.concat([original,Buffer.from([0])]);sign(null,extra.subarray(65),f.privateKey).copy(extra,1);
 await assert.rejects(f.protocol.inspectSignedRecipientSetup(extra.toString('base64')));
});
test('v0 service submits once, verifies exact simulated effects and recovers its actual signature',async()=>{
 const f=await fixture();f.state.signedWire=versionedFixtureWire(f);const result=await f.service.submit({packet:f.packet,signedBase64:f.state.signedWire,explicitApproval:true});
 assert.equal(f.state.sends,1);assert.equal((await f.service.recover(result.signature)).stage,'RECIPIENT_SETUP_CONFIRMED');assert.equal(f.state.sends,1);
});

test('all 120 readonly-key permutations preserve the fixed recipe, signature and review',async()=>{
 const f=await fixture();for(const order of permutations([2,3,4,5,6])){
  const wire=reorderedFixtureWire(f,order),checked=await f.protocol.validateSignedRecipientSetup(f.packet,wire,{now:at});
  assert.equal(checked.destination,f.packet.destination);assert.equal(checked.blockhash,f.packet.blockhash);assert.equal(checked.legacy,false);
 }
});
test('permuted keys cannot hide changed payer, writable roles, mint, fee, instruction order or blockhash',async()=>{
 const f=await fixture(),wire=Buffer.from(reorderedFixtureWire(f,[3,5,6,2,4]),'base64');
 for(const offset of [65,66,67,69,101,133,325,326,329,333,337,345]){
  const altered=Buffer.from(wire);altered[offset]^=1;sign(null,altered.subarray(65),f.privateKey).copy(altered,1);
  await assert.rejects(f.protocol.validateSignedRecipientSetup(f.packet,altered.toString('base64'),{now:at}));
 }
 const bh=Buffer.from(wire);bh[293]^=1;sign(null,bh.subarray(65),f.privateKey).copy(bh,1);
 await assert.rejects(f.protocol.validateSignedRecipientSetup(f.packet,bh.toString('base64'),{now:at}));
});
test('HTTP submits the owner-signed equivalent readonly ordering once and recovers its exact signature',async()=>{
 const f=await fixture();f.state.signedWire=reorderedFixtureWire(f,[3,5,6,2,4]);
 const result=await f.service.submit({packet:f.packet,signedBase64:f.state.signedWire,explicitApproval:true});assert.equal(f.state.sends,1);
 assert.equal((await f.service.recover(result.signature)).stage,'RECIPIENT_SETUP_CONFIRMED');assert.equal(f.state.sends,1);
});
test('canonical setup validates a fixture owner signature but rejects changed payer, cost and message',async()=>{
 const f=await fixture();await f.protocol.validateRecipientSetupPacket(f.packet,{now:at});
 assert.equal((await f.protocol.validateSignedRecipientSetup(f.packet,f.signed,{now:at})).destination,f.packet.destination);
 for(const patch of [{payer:FEE.recipient},{destination:FEE.recipient},{estimatedTotalLamports:'1'},{networkFeeLamports:'10001'},{usdcTransferredUnits:'1'}])await assert.rejects(f.protocol.validateSignedRecipientSetup({...f.packet,...patch},f.signed,{now:at}));
 const bad=Buffer.from(f.signed,'base64');bad[80]^=1;await assert.rejects(f.protocol.inspectSignedRecipientSetup(bad.toString('base64')));
});

test('priority budget is fixed before signing; even freshly owner-signed budget mutations are rejected',async()=>{
 const f=await fixture(),wire=Buffer.from(f.signed,'base64');assert.equal(wire.length,356);
 for(const offset of [65+265,65+273,65+281]){
  const changed=Buffer.from(wire);changed[offset]^=1;sign(null,changed.subarray(65),f.privateKey).copy(changed,1);
  await assert.rejects(f.protocol.inspectSignedRecipientSetup(changed.toString('base64')));
 }
 const legacy=await f.protocol.compileRecipientSetupMessage(f.packet.blockhash,{legacy:true});
 const old=Buffer.concat([Buffer.from([1]),sign(null,legacy.message,f.privateKey),legacy.message]).toString('base64');
 assert.equal((await f.protocol.inspectSignedRecipientSetup(old)).destination,f.packet.destination,'read-only reconciliation still recognizes old exact signatures');
 await assert.rejects(f.protocol.validateSignedRecipientSetup(f.packet,old,{now:at}),'new review must not submit an old no-budget message');
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
 await el.connect.onclick();await el.prepare.onclick();assert.match(el.summary.textContent,/0\.00149644 SOL/);assert.equal(el.confirm.disabled,true);
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
  if(kind==='provider-rejected')throw Object.assign(Error('PRIVATE_PROVIDER_ERROR_MUST_NOT_RENDER'),{code:4001});
  if(kind==='provider-error')throw Error('PRIVATE_PROVIDER_ERROR_MUST_NOT_RENDER');
  if(['focus-return','focus-missing','hidden','changed-account'].includes(kind))focused=false;
  if(kind==='hidden')doc.hidden=true;
  const wire=Uint8Array.from(Buffer.from(f.signed,'base64'));
  if(kind==='readonly-reorder'){f.state.signedWire=reorderedFixtureWire(f,[3,5,6,2,4]);return [{signedTransaction:Uint8Array.from(Buffer.from(f.state.signedWire,'base64'))}];}
  if(kind==='v0'){f.state.signedWire=versionedFixtureWire(f);return [{signedTransaction:Uint8Array.from(Buffer.from(f.state.signedWire,'base64'))}];}
  if(kind==='guards'){f.state.signedWire=guardedFixtureWire(f);return [{signedTransaction:Uint8Array.from(Buffer.from(f.state.signedWire,'base64'))}];}
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
test('page accepts a verified readonly-key reorder without a second signature prompt or changed effects',async()=>{
 const {f,el}=await approvalScenario('readonly-reorder');assert.equal(f.state.prompts,1);assert.equal(f.state.sends,1);await el.recover.onclick();assert.match(el.status.textContent,/operación finalizada/);assert.equal(f.state.sends,1);
});
test('page accepts an owner-signed v0 equivalent and reconciles without requesting a second signature',async()=>{
 const {f,el}=await approvalScenario('v0');assert.equal(f.state.prompts,1);assert.equal(f.state.sends,1);await el.recover.onclick();assert.match(el.status.textContent,/operación finalizada/);assert.equal(f.state.sends,1);
});
test('page accepts validated 439-byte protection guards, submits once and recovers',async()=>{
 const {f,el}=await approvalScenario('guards');assert.equal(f.state.prompts,1);assert.equal(f.state.sends,1);await el.recover.onclick();assert.match(el.status.textContent,/operación finalizada/);assert.equal(f.state.sends,1);
});
for(const [kind,message]of [['expired',/La revisión venció/],['changed-wire',/SETUP_WALLET_TRANSACTION_CHANGED/],['focus-missing',/SETUP_FOCUS_NOT_RETURNED/],['hidden',/SETUP_FOCUS_NOT_RETURNED/],['changed-account',/La cuenta o la revisión cambió/],['provider-rejected',/SETUP_WALLET_DECLINED/],['provider-error',/SETUP_WALLET_SIGN_FAILED/]])test('approval safely retains the exact reason without submission: '+kind,async()=>{
 const {f,el,values}=await approvalScenario(kind);assert.equal(f.state.prompts,1);assert.equal(f.state.sends,0);assert.match(el.status.textContent,message);
 await el.recover.onclick();assert.match(el.status.textContent,message);assert.equal(f.state.sends,0);assert.equal(f.state.prompts,1);
 assert.doesNotMatch(el.status.textContent,/PRIVATE_PROVIDER_ERROR/);
 const pending=JSON.parse([...values.values()][0]);assert.equal(pending.stage,'SIGNING');if(kind==='changed-wire'){assert.deepEqual(pending.shape,{bytes:357,format:'legacy',instructions:[]});assert.match(el.status.textContent,/357 bytes/);}await el.discard.onclick();assert.equal(values.size,0);
});

test('old SIGNING records are identified as unclassified, never replayed or silently discarded',async()=>{
 const {f,el,values}=await approvalScenario('provider-error'),key=[...values.keys()][0];values.set(key,JSON.stringify({stage:'SIGNING',createdAt:at}));
 await el.recover.onclick();assert.match(el.status.textContent,/SETUP_LEGACY_SIGNING/);assert.equal(f.state.sends,0);assert.equal(f.state.prompts,1);assert.equal(values.size,1);
});
