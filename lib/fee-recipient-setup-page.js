import bs58 from 'bs58';
import {recipientSetupProtocol,setupBytes,setupBase64} from './fee-recipient-setup-protocol.js';
import {setupInstructionSummary} from './fee-recipient-setup-guards.js';
const PENDING='jamddmaj-fee-recipient-setup-v1';
const UI_VERSION='2026.10.27.8';
const differences={LENGTH:'size or format',HEADER:'header or permissions',KEYS:'accounts',BLOCKHASH:'block reference',INSTRUCTIONS:'instructions or signature'};
function changeKind(original,wire){
 if(wire.length!==original.length)return 'LENGTH';
 if(wire.subarray(0,1).some((v,i)=>v!==original[i])||wire.subarray(65,69).some((v,i)=>v!==original[65+i]))return 'HEADER';
 const count=original[68],keys=b=>Array.from({length:count},(_,i)=>Array.from(b.subarray(69+i*32,101+i*32)).join(','));
 const a=keys(original),b=keys(wire);if(a[0]!==b[0]||a[1]!==b[1]||a.slice(2).sort().join('|')!==b.slice(2).sort().join('|'))return 'KEYS';
 const offset=69+count*32;if(wire.subarray(offset,offset+32).some((v,i)=>v!==original[offset+i]))return 'BLOCKHASH';
 return 'INSTRUCTIONS';
}
function failureText(code,difference,shape){
 const summary=Array.isArray(shape?.instructions)&&shape.instructions.length<=7&&shape.instructions.every(ix=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ix.program)&&Number.isInteger(ix.opcode)&&ix.opcode>=0&&ix.opcode<=255&&Number.isInteger(ix.bytes)&&ix.bytes>=0&&ix.bytes<=120&&Number.isInteger(ix.accounts)&&ix.accounts>=0&&ix.accounts<=6)?shape.instructions.map(ix=>ix.program+' #'+ix.opcode+' / '+ix.bytes+' bytes / '+ix.accounts+' accounts'+(Number.isInteger(ix.log)&&ix.log>=0&&ix.log<=255?' / log '+ix.log:'')).join('; '):'';
 return failures[code]+(Object.hasOwn(differences,difference||'')?' Detail: '+differences[difference]+' ('+difference+').':'')+(shape&&Number.isInteger(shape.bytes)&&shape.bytes>=0&&shape.bytes<=1232&&['legacy','v0','other'].includes(shape.format)?' Returned format: '+shape.format+'; size: '+shape.bytes+' bytes.':'')+(summary?' Programs: '+summary+'.':'');
}
const failures={
 SETUP_REVIEW_EXPIRED:'The review expired while Phantom was open. The signature was not sent. Discard this review and prepare another; review and approve before it expires.',
 SETUP_WALLET_TRANSACTION_CHANGED:'Phantom returned a different transaction from the reviewed one. Nothing was sent. Do not confirm again yet; keep this message. Code: SETUP_WALLET_TRANSACTION_CHANGED.',
 SETUP_FOCUS_NOT_RETURNED:'The page did not regain focus after Phantom. The signature was not sent. Discard this review before preparing another. Code: SETUP_FOCUS_NOT_RETURNED.',
 SETUP_ACCOUNT_CHANGED:'The account or review changed during approval. Nothing was sent. Connect the indicated account and prepare a new review.',
 SETUP_SIGNATURE_INVALID:'The signature returned by Phantom could not be verified. Nothing was sent. Code: SETUP_SIGNATURE_INVALID.',
 SETUP_WALLET_SIGN_FAILED:'Phantom did not return a usable signature. This screen did not send the operation. Code: SETUP_WALLET_SIGN_FAILED.',
 SETUP_WALLET_DECLINED:'Phantom rejected or cancelled the signature request. This screen did not send the operation. Code: SETUP_WALLET_DECLINED.',
 SETUP_PENDING_STORAGE_FAILED:'The browser could not save the required state. This screen did not send the operation. Code: SETUP_PENDING_STORAGE_FAILED.',
 SETUP_LOCAL_CHECK_FAILED:'A local check stopped the process before sending. Code: SETUP_LOCAL_CHECK_FAILED.'
};
function amount(text){const s=String(text).padStart(10,'0');return s.slice(0,-9)+'.'+s.slice(-9).replace(/0+$/,'');}
export function setupFeeRecipientSetupPage({doc,registry,fetchImpl,storage,locks,now=Date.now,protocol=recipientSetupProtocol,waitForFocus}={}){
 const FEE=protocol.policy,{validateRecipientSetupPacket,validateSignedRecipientSetup}=protocol;
 const ids=['recipient','wallets','connect','mobile','wallet-status','prepare','summary','account','consent','confirm','recover','discard','status'];
 const el=Object.fromEntries(ids.map(id=>[id,doc.getElementById(id)]));
 const version=doc.getElementById('flow-version');if(version)version.textContent='Setup wizard '+UI_VERSION;
 let wallet=null,account=null,packet=null,busy=false,revision=0,unsubscribe=null,expiry;
 el.recipient.textContent=FEE.recipient;el.consent.checked=false;
 function pending(){const raw=storage.getItem(PENDING);if(!raw)return null;const p=JSON.parse(raw);if(!p||!['SIGNING','SUBMITTING'].includes(p.stage)||p.stage==='SUBMITTING'&&typeof p.signature!=='string')throw Error('PENDING_STORAGE');return p;}
 function foreground(){return !doc.hidden&&doc.visibilityState==='visible'&&doc.hasFocus();}
 async function regainFocus(){
  if(foreground())return;
  // Extension approval can resolve before its popup returns browser focus.
  // Never send from a hidden/unfocused page or wait beyond this single attempt.
  if(waitForFocus)await waitForFocus();
  else await new Promise(resolve=>{const started=performance.now();const poll=()=>{if(foreground()||performance.now()-started>=3000)resolve();else setTimeout(poll,50);};poll();});
  if(!foreground())throw Error('SETUP_FOCUS_NOT_RETURNED');
 }
 function connected(){
  const f=wallet?.features?.['solana:signTransaction'];
  return account?.address===FEE.recipient&&account.publicKey instanceof Uint8Array&&bs58.encode(account.publicKey)===FEE.recipient
   &&account.chains?.includes('solana:mainnet')&&account.features?.includes('solana:signTransaction')
   &&wallet.accounts?.some(a=>a.address===FEE.recipient)&&f?.supportedTransactionVersions?.includes('legacy')&&typeof f.signTransaction==='function';
 }
 function invalidate(){packet=null;revision++;el.consent.checked=false;clearTimeout(expiry);render();}
 function render(){
  let p;try{p=pending();}catch{p={stage:'STORAGE_ERROR'};}
  el.confirm.disabled=busy||!packet||!connected()||!foreground()||!el.consent.checked||now()>=packet.reviewExpiresAt||!!p;
  el.prepare.disabled=busy||!!p;el.connect.disabled=busy;el.wallets.disabled=busy;el.recover.disabled=busy;
  el.consent.disabled=busy||!packet||!!p;el.discard.hidden=p?.stage!=='SIGNING';el.discard.disabled=busy;
 }
 function inventory(){
  el.wallets.replaceChildren();for(const w of registry.get().filter(w=>String(w.name).toLowerCase()==='phantom'&&typeof w.features?.['standard:connect']?.connect==='function')){
   const option=doc.createElement('option');option.textContent=String(w.name).slice(0,60);option.value=String(registry.get().indexOf(w));el.wallets.append(option);
  }
  if(!el.wallets.children.length){const o=doc.createElement('option');o.textContent='No Phantom detected. Use its mobile browser or extension.';o.value='';el.wallets.append(o);}
 }
 async function api(body){
  const r=await fetchImpl('/api/fee-recipient-setup',{method:body?'POST':'GET',redirect:'error',cache:'no-store',credentials:'omit',
   headers:{Accept:'application/json',...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(20000)});
  if(r.redirected||r.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error('SERVICE');
  const text=await r.text();if(text.length>10000)throw Error('SERVICE');const value=JSON.parse(text);if(r.status!==200||value.ok!==true||!value.result)throw Error('SERVICE');return value.result;
 }
 async function run(fn){if(busy)return;busy=true;render();try{await fn();}catch(error){
  let p,code=Object.hasOwn(failures,error?.message||'')?error.message:'SETUP_LOCAL_CHECK_FAILED';
  const difference=code==='SETUP_WALLET_TRANSACTION_CHANGED'&&Object.hasOwn(differences,error?.difference||'')?error.difference:undefined;
  const shape=difference?error?.shape:undefined;
  try{p=pending();if(p?.stage==='SIGNING')storage.setItem(PENDING,JSON.stringify({...p,failureCode:code,...difference?{difference,shape}:{},uiVersion:UI_VERSION}));}catch{}
  el.status.textContent=p?.stage==='SUBMITTING'?'The send was not confirmed. Check the pending result; do not repeat the operation.':failureText(code,difference,shape);
 }finally{busy=false;render();}}
 el.connect.onclick=()=>run(async()=>{
  invalidate();unsubscribe?.();wallet=null;account=null;
  const w=registry.get()[Number(el.wallets.value)];if(!w||String(w.name).toLowerCase()!=='phantom')throw Error('WALLET');
  const result=await w.features['standard:connect'].connect({silent:false});
  wallet=w;account=result.accounts?.find(a=>a.address===FEE.recipient)||null;
  if(!connected()){account=null;el['wallet-status'].textContent='Select the account in Phantom: '+FEE.recipient+'. No other wallet can authorize this setup.';return;}
  const events=w.features['standard:events'];if(events?.on)unsubscribe=events.on('change',()=>{account=null;invalidate();el['wallet-status'].textContent='The Phantom account changed. Connect again before signing.';});
  el['wallet-status'].textContent='Phantom connected · '+FEE.recipient;
 });
 el.prepare.onclick=()=>run(async()=>{
  if(pending())throw Error('PENDING');invalidate();el.summary.textContent='Checking cost and simulation...';const value=await api();
  if(value.stage==='FEE_RECIPIENT_USDC_ALREADY_EXISTS'&&value.owner===FEE.recipient&&value.mint===FEE.mint){el.summary.textContent='The USDC account is already available. You do not need to create it or pay again.';el.account.textContent=value.destination;return;}
  await validateRecipientSetupPacket(value,{now:now()});packet=Object.freeze(value);
  el.summary.textContent='Account reserve: '+amount(value.rentReserveLamports)+' SOL · Network: '+amount(value.networkFeeLamports)+' SOL · Estimated total: '+amount(value.estimatedTotalLamports)+' SOL. No USDC will be transferred.';
  el.account.textContent='USDC account: '+value.destination;el.status.textContent='Review the amounts. The review lasts 60 seconds, including time in Phantom. If it expires, the signature will not be sent; you will need to prepare another.';
  expiry=setTimeout(()=>{invalidate();el.status.textContent='The review expired. Check and prepare a new one before signing.';},Math.max(1,value.reviewExpiresAt-now()));expiry?.unref?.();
 });
 el.consent.onchange=render;
 el.confirm.onclick=()=>run(async()=>{
  if(!locks?.request)throw Error('LOCK_UNAVAILABLE');
  await locks.request('jamddmaj-fee-recipient-setup',{ifAvailable:true},async lock=>{
   if(!lock||pending()||!packet||!connected()||!foreground()||!el.consent.checked)throw Error('NOT_APPROVED');
   const selected=packet,ticket=revision,feature=wallet.features['solana:signTransaction'];
   await validateRecipientSetupPacket(selected,{now:now()});
   if(ticket!==revision||!connected()||!foreground())throw Error('CHANGED');
   try{storage.setItem(PENDING,JSON.stringify({stage:'SIGNING',createdAt:now(),uiVersion:UI_VERSION}));}catch{throw Error('SETUP_PENDING_STORAGE_FAILED');}render();
   let results;try{results=await feature.signTransaction({account,chain:'solana:mainnet',transaction:setupBytes(selected.serializedTxBase64),options:{preflightCommitment:'confirmed',minContextSlot:selected.observedSlot}});}
   catch(error){throw Error(now()>=selected.reviewExpiresAt?'SETUP_REVIEW_EXPIRED':error?.code===4001||error?.code==='ACTION_REJECTED'?'SETUP_WALLET_DECLINED':'SETUP_WALLET_SIGN_FAILED');}
   if(now()>=selected.reviewExpiresAt)throw Error('SETUP_REVIEW_EXPIRED');
   if(!Array.isArray(results)||results.length!==1||!(results[0]?.signedTransaction instanceof Uint8Array))throw Error('SETUP_SIGNATURE_INVALID');
   const wire=results[0].signedTransaction,original=setupBytes(selected.serializedTxBase64);
   const messageChanged=wire.length!==original.length||wire[0]!==1||wire.subarray(65).some((value,i)=>value!==original[65+i]);
   const signedBase64=setupBase64(wire);let signed;
   try{signed=await validateSignedRecipientSetup(selected,signedBase64,{now:now()});}catch{throw Object.assign(Error(now()>=selected.reviewExpiresAt?'SETUP_REVIEW_EXPIRED':messageChanged?'SETUP_WALLET_TRANSACTION_CHANGED':'SETUP_SIGNATURE_INVALID'),messageChanged?{difference:changeKind(original,wire),shape:{bytes:wire.length,format:wire[65]===128?'v0':wire[65]===1?'legacy':'other',instructions:setupInstructionSummary(wire)}}:{});}
   await regainFocus();
   if(now()>=selected.reviewExpiresAt)throw Error('SETUP_REVIEW_EXPIRED');
   if(ticket!==revision||!connected())throw Error('SETUP_ACCOUNT_CHANGED');
   try{storage.setItem(PENDING,JSON.stringify({stage:'SUBMITTING',signature:signed.signature,createdAt:now(),uiVersion:UI_VERSION}));}catch{throw Error('SETUP_PENDING_STORAGE_FAILED');}
   invalidate();const response=await api({action:'submit',packet:selected,signedBase64,explicitApproval:true});
   if(response.signature!==signed.signature)throw Error('SIGNATURE');
   if(response.accountReady===true&&response.stage==='RECIPIENT_ACCOUNT_ALREADY_READY'){storage.removeItem(PENDING);el.status.textContent='The USDC account was already created. This screen did not send another operation.';}
   else el.status.textContent='Send pending confirmation. Press "Check pending result"; do not sign again.';
  });
 });
 el.recover.onclick=()=>run(async()=>{
  const p=pending();if(!p){el.status.textContent='There is no send recorded in this browser.';return;}
  if(p.stage==='SIGNING'){el.status.textContent=Object.hasOwn(failures,p.failureCode||'')?failureText(p.failureCode,p.difference,p.shape):'The saved review does not include the failure cause. This screen recorded no send. Code: SETUP_LEGACY_SIGNING. Discard this review before preparing another.';return;}
  const result=await api({action:'recover',signature:p.signature});if(result.signature!==p.signature)throw Error('SIGNATURE');
  if(result.accountReady===true){storage.removeItem(PENDING);invalidate();el.status.textContent=result.stage==='RECIPIENT_SETUP_CONFIRMED'?'USDC account available and operation complete.':'The USDC account is available; this signature is not confirmed yet. You do not need to create another account.';}
  else if(result.stage==='RECIPIENT_SETUP_FAILED'){storage.removeItem(PENDING);invalidate();el.status.textContent='The network confirmed the operation failed. It was not retried automatically.';}
  else el.status.textContent='Still unconfirmed. The record is kept; do not repeat the operation.';
 });
 el.discard.onclick=()=>{if(!busy&&pending()?.stage==='SIGNING'){storage.removeItem(PENDING);invalidate();el.status.textContent='Review discarded without sending from this screen.';}};
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&!busy)invalidate();else render();});inventory();registry.on('register',inventory);registry.on('unregister',inventory);render();
 return Object.freeze({elements:el,render});
}
