import {prepareTokenCreation,tokenCreatorJournal,readTokenCreation} from './lib/token-creator.js';
import {formatTestSol} from './lib/fair-launch-costs.js';
import {getWalletRegistry} from './lib/wallet-standard-registry.js';
import {getCompatibleSolanaWallets,sanitizeWalletName} from './lib/wallet-security.js';
import {checkedTokenName,findTokenNameMatches,localTokenNameMatches} from './lib/token-name-check.js';

export function initializeTokenCreator(root){
 if(!root)return;
 const by=id=>root.querySelector('[data-token="'+id+'"]');
 const journal=tokenCreatorJournal({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)});
 const registry=getWalletRegistry();let wallet=null,account=null,candidate=null,busy=false,choices=[],nameCheck=null,revision=0;
 const status=by('status'),review=by('review'),approval=by('approval');
 function pending(){try{return journal.read();}catch{status.textContent='Could not read the saved operation. Do not repeat the creation.';return true;}}
 function controls(){const p=pending();by('prepare').disabled=busy||Boolean(p)||!account;by('submit').disabled=busy||Boolean(p)||!candidate||!approval.checked||Date.now()>=candidate.review.expiresAt||!nameCheck||nameCheck.status!=='no-indexed-match'||Date.now()>=nameCheck.expiresAt;by('check-name').disabled=busy||Boolean(p);by('recover').hidden=!p;by('connect').disabled=busy||!choices.length;}
 function invalidate(clearName=true){revision++;candidate=null;approval.checked=false;review.replaceChildren();if(clearName){nameCheck=null;by('name-results').replaceChildren();}controls();}
 function options(){choices=getCompatibleSolanaWallets(registry.get());by('wallets').replaceChildren(...choices.map(({name},i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=name;return option;}));by('connect').disabled=!choices.length||busy;}
 registry.on('register',options);registry.on('unregister',options);options();
 for(const field of root.querySelectorAll('input:not([type="checkbox"])'))field.addEventListener('input',invalidate);
 approval.addEventListener('change',controls);
 by('preset').onclick=()=>{by('name').value='JamdDmaj';by('symbol').value='JAMD';by('supply').value='100000000';by('decimals').value='6';invalidate();};
 by('connect').onclick=async()=>{try{
  invalidate(false);wallet=choices[Number(by('wallets').value)]?.wallet;if(!wallet)throw Error('No compatible wallet detected.');
  const result=await wallet.features['standard:connect'].connect();account=result.accounts?.find(a=>a.chains?.includes('solana:mainnet'))||null;
  if(!account)throw Error('The wallet does not offer a Solana mainnet account.');
  status.textContent=`${sanitizeWalletName(wallet.name)} · ${account.address} · Solana mainnet`;
 }catch(error){wallet=null;account=null;status.textContent=error.message;}controls();};
 async function exclusive(task){
  if(!navigator.locks?.request){status.textContent='This browser cannot lock the operation across tabs. The wallet was not opened.';return;}
  await navigator.locks.request('jamd.tokenCreator.mainnet',{mode:'exclusive',ifAvailable:true},async lock=>{
   if(!lock){status.textContent='Another review is open. Finish it before continuing.';return;}
   busy=true;controls();try{await task();}catch(error){candidate=null;approval.checked=false;status.textContent=(pending()?'There is a pending operation. Check the result; do not create the token again. ':'The operation was not completed. ')+String(error.message||'TOKEN_ERROR');}finally{busy=false;controls();}
  });
 }
 function renderNames(result){
  const box=by('name-results');box.replaceChildren();
  const p=document.createElement('p');
  p.textContent=result.status==='duplicate'?'Name or symbol already detected. Choose another to create from JamdDmaj.':result.status==='no-indexed-match'?'No matches in the queried sources. This does NOT reserve the name or guarantee exclusivity on Solana.':'The search could not be completed. Availability cannot be declared; check again.';
  box.append(p);
  for(const m of result.matches.slice(0,10)){const row=document.createElement('p'),link=document.createElement('a');
   row.append(document.createTextNode(`${m.name} (${m.symbol}) · ${m.nameMatch?'name match':''}${m.nameMatch&&m.symbolMatch?' and ':''}${m.symbolMatch?'symbol match':''} · `));
   link.textContent=m.mint;link.href='https://explorer.solana.com/address/'+encodeURIComponent(m.mint);link.target='_blank';link.rel='noopener noreferrer';row.append(link);box.append(row);
  }
  const foot=document.createElement('p');foot.textContent='Real identity: mint address, not name or symbol. Results do not verify legitimacy and may omit recent or unindexed tokens.';box.append(foot);
  if(result.sources?.length){const sourceLine=document.createElement('p');sourceLine.textContent='Sources: '+result.sources.map(s=>s.source+(s.available?' · queried':' · unavailable')).join(' / ');box.append(sourceLine);}
 }
 async function checkNames(identity=checkedTokenName({name:by('name').value,symbol:by('symbol').value}),generation=revision){
  const local=localTokenNameMatches(identity,localStorage);let remote;
  status.textContent='Checking name and symbol in public indexes...';
  try{
   const url=new URL('https://www.jamddmaj.com/api/token-name-check');url.search=new URLSearchParams(identity).toString();
   const response=await fetch(url,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(18000)});remote=await response.json();
   if(remote.network!=='solana:mainnet'||remote.name!==identity.name||remote.symbol!==identity.symbol||!['duplicate','no-indexed-match','unavailable'].includes(remote.status)||!Array.isArray(remote.matches)||!Number.isSafeInteger(remote.checkedAt)||!Number.isSafeInteger(remote.expiresAt)||remote.expiresAt<=Date.now()||remote.expiresAt-remote.checkedAt>120000||Math.abs(Date.now()-remote.checkedAt)>300000)throw Error('TOKEN_NAME_RESPONSE');
  }catch{remote={status:'unavailable',matches:[],expiresAt:0};}
  if(revision!==generation)throw Error('TOKEN_NAME_CHANGED');
  const matches=findTokenNameMatches(identity,[...local.map(m=>({...m,source:'Creation confirmed on this device'})),...remote.matches.map(m=>({...m,source:'Public indexes'}))]);
  nameCheck={status:matches.length?'duplicate':remote.status==='no-indexed-match'?'no-indexed-match':'unavailable',matches,expiresAt:remote.expiresAt,sources:remote.sources};
  renderNames(nameCheck);controls();
  if(nameCheck.status==='duplicate')throw Error('TOKEN_NAME_DUPLICATE');
  if(nameCheck.status!=='no-indexed-match')throw Error('TOKEN_NAME_LOOKUP_UNAVAILABLE');
  return identity;
 }
 by('check-name').onclick=()=>exclusive(async()=>{await checkNames();status.textContent='Check complete. Nothing was signed or sent.';});
 by('prepare').onclick=()=>exclusive(async()=>{
  invalidate(false);const generation=revision,identity={...checkedTokenName({name:by('name').value,symbol:by('symbol').value}),supply:by('supply').value,decimals:by('decimals').value};
  await checkNames({name:identity.name,symbol:identity.symbol},generation);
  const prepared=await prepareTokenCreation({identity,wallet,account,journal});
  if(generation!==revision)throw Error('TOKEN_NAME_CHANGED');candidate=prepared;
  const r=candidate.review;review.replaceChildren();
  for(const text of ['SOLANA MAINNET · real SOL',`${r.name} (${r.symbol}) · ${r.supply} tokens · ${r.decimals} decimals`,`Receives the entire supply: ${r.recipient}`,`Network: ${formatTestSol(r.networkFeeLamports)} SOL · Account reserves: ${formatTestSol(r.accountReservesLamports)} SOL`,`Estimated total: ${formatTestSol(r.estimatedTotalLamports)} SOL · JamdDmaj fee: 0 SOL`,'Additional minting and freezing disabled; name and symbol immutable.','No pool, no guaranteed price, no vesting and no automatic distribution. The entire supply stays in your wallet.','Review valid for 45 seconds. Also review what your wallet shows.']){
   const line=document.createElement('p');line.textContent=text;review.append(line);
  }
  status.textContent='Review the data. Preparing does not sign or send.';
 });
 by('submit').onclick=()=>exclusive(async()=>{
  if(!candidate||!approval.checked)throw Error('TOKEN_APPROVAL_REQUIRED');
  const prepared=candidate;candidate=null;approval.checked=false;
  await checkNames({name:prepared.review.name,symbol:prepared.review.symbol},revision);
  const r=await prepared.approveAndSubmit({explicitApproval:true});status.textContent=`Sent; pending confirmation. ${r.signature}`;
 });
 by('recover').onclick=()=>exclusive(async()=>{
  const r=await readTokenCreation(journal);if(!r)return;
  status.textContent=r.state==='confirmed'?`Token confirmed: ${r.mint}`:r.state==='failed'?'The network rejected the operation. Check your wallet history.':r.state==='expired'?'The operation expired without confirmed creation. You can prepare another review.':'Result still pending. Checking does not resend.';
  if(r.state==='confirmed'){const link=document.createElement('a');link.href='https://explorer.solana.com/address/'+encodeURIComponent(r.mint);link.target='_blank';link.rel='noopener noreferrer';link.textContent='View token on Solana Explorer';status.append(document.createTextNode(' '),link);}
 });
 controls();
 const timer=setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}controls();},1000);
}
