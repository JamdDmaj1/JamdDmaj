import {prepareCpmmPool,readCpmmResult,cpmmJournal,CPMM} from './lib/cpmm-pool.js';
import {getWalletRegistry} from './lib/wallet-standard-registry.js';
import {getCompatibleSolanaWallets,sanitizeWalletName} from './lib/wallet-security.js';
import {formatTestSol} from './lib/fair-launch-costs.js';

export function initializeCpmmPool(root){
 if(!root)return;const el=n=>root.querySelector('[data-pool="'+n+'"]');
 const journal=cpmmJournal(localStorage),registry=getWalletRegistry();
 let choices=[],wallet=null,account=null,candidate=null,busy=false;
 const pending=()=>{try{return journal.read();}catch{el('status').textContent='Could not read the pending operation. Do not repeat the send.';return true;}};
 function controls(){const p=pending();el('prepare').disabled=busy||Boolean(p)||!account;el('submit').disabled=busy||Boolean(p)||!candidate||!el('approval').checked||Date.now()>=candidate.review.expiresAt;el('connect').disabled=busy||!choices.length;el('recover').hidden=!p;}
 function invalidate(){candidate=null;el('approval').checked=false;el('review').replaceChildren();controls();}
 function options(){choices=getCompatibleSolanaWallets(registry.get());el('wallets').replaceChildren(...choices.map(({name},i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=name;return o;}));controls();}
 registry.on('register',options);registry.on('unregister',options);options();
 const messages={POOL_INSUFFICIENT_TOKENS:'The wallet does not have both amounts available.',POOL_TOKEN_ACCOUNT:'You need token and USDC balances in this wallet’s associated accounts.',POOL_MINT_AUTHORITIES:'This form requires a token with additional minting and freezing disabled.',POOL_UNSUPPORTED_EXTENSION:'This token has extensions not supported by this integration.',POOL_SIMULATION:'The simulation failed; no signature was requested.',POOL_NETWORK:'Solana mainnet could not be verified.',POOL_AMOUNT:'Enter positive amounts without scientific notation.',POOL_PRECISION:'The amount has more decimals than allowed.',POOL_CONFIG_CHANGED:'The market configuration changed. Prepare another review.'};
 async function exclusive(task){
  if(!navigator.locks?.request){el('status').textContent='This browser cannot lock across tabs. No signature was requested.';return;}
  await navigator.locks.request('jamd.cpmm.mainnet',{mode:'exclusive',ifAvailable:true},async lock=>{
   if(!lock){el('status').textContent='Another tab is reviewing a contribution.';return;}
   busy=true;controls();try{await task();}catch(e){candidate=null;el('approval').checked=false;el('status').textContent=(pending()?'There is a pending operation: check the result and do not repeat. ':'')+(messages[e.message]||'The operation was not completed.')+' · '+String(e.message||'POOL_ERROR');}finally{busy=false;controls();}
  });
 }
 for(const n of ['mint','tokens','usdc'])el(n).addEventListener('input',invalidate);
 el('approval').addEventListener('change',controls);
 el('connect').onclick=async()=>{try{invalidate();wallet=choices[Number(el('wallets').value)]?.wallet;if(!wallet)throw Error('POOL_WALLET');const r=await wallet.features['standard:connect'].connect();account=r.accounts?.find(a=>a.chains?.includes('solana:mainnet'));if(!account)throw Error('POOL_WALLET');el('status').textContent=sanitizeWalletName(wallet.name)+' · '+account.address+' · Solana mainnet';}catch(e){account=null;el('status').textContent='No compatible Solana mainnet wallet was connected.';}controls();};
 el('prepare').onclick=()=>exclusive(async()=>{
  invalidate();candidate=await prepareCpmmPool({mint:el('mint').value.trim(),tokenAmount:el('tokens').value.trim(),usdcAmount:el('usdc').value.trim(),wallet,account,journal});
  const r=candidate.review;
  const ratio=Number(r.usdcAmount)/Number(r.tokenAmount);
  const lines=[r.kind==='create'?'CREATE POOL · SOLANA MAINNET':'ADD TO EXISTING POOL · SOLANA MAINNET',
   'Wallet contributing and receiving the LP share: '+r.owner,'Token: '+r.mint,'Pool: '+r.pool,'Raydium CPMM program: '+CPMM,
   'Available: '+r.tokenBalance+' tokens · '+r.usdcBalance+' USDC',
   (r.kind==='create'?'Initial contribution: ':'Maximum authorized: ')+r.tokenAmount+' tokens + '+r.usdcAmount+' USDC',
   r.kind==='create'?'Initial ratio: '+ratio.toPrecision(8)+' USDC/token. It does not guarantee a sale value.':'Deposit proportional to the pool. The entered amounts are maximums, not a new price.',
   'Minimum LP share: '+r.minimumLpBaseUnits+' base units (9 decimals).',
   'Network: '+formatTestSol(r.networkFeeLamports)+' SOL · Raydium creation: '+formatTestSol(r.creationFeeLamports)+' SOL · Reserves: '+formatTestSol(r.accountReservesLamports)+' SOL',
   'Estimated total SOL: '+formatTestSol(r.totalSolLamports)+' · in addition to the contributed tokens and USDC. JamdDmaj fee for this contribution: 0.',
   'Regular market fee: '+(Number(r.dexTradeFeePpm)/10000)+'% per swap, according to the queried configuration.',
   'NO LOCK: the LP stays in your wallet. It does not activate the 1% buy fee, permanent lock or JAMD distribution.',
   'Risk of loss and change in pool composition. Review valid for 45 seconds.'];
  el('review').replaceChildren(...lines.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
  el('status').textContent='Review and simulation only. Nothing was signed or sent.';
 });
 el('submit').onclick=()=>exclusive(async()=>{if(!candidate||!el('approval').checked)throw Error('POOL_APPROVAL');const c=candidate;candidate=null;el('approval').checked=false;const r=await c.approveAndSubmit({explicitApproval:true});el('status').textContent='Operation sent, pending confirmation. '+r.signature;});
 el('recover').onclick=()=>exclusive(async()=>{const r=await readCpmmResult(journal);if(!r)return;el('status').textContent=r.state==='confirmed'?'Contribution confirmed. LP not locked. Pool: '+r.pool:r.state==='failed'?'The network rejected the operation; it may have charged the network fee.':r.state==='expired'?'The creation expired without a confirmed pool.':'Result uncertain or pending. Checking does not resend.';
  if(r.state==='confirmed'){const a=document.createElement('a');a.href='https://explorer.solana.com/address/'+encodeURIComponent(r.pool);a.target='_blank';a.rel='noopener noreferrer';a.textContent=' View pool';el('status').append(a);}
 });
 controls();const timer=setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}controls();},1000);
}
