import {prepareTokenCreation,tokenCreatorJournal,readTokenCreation} from './lib/token-creator.js';
import {formatTestSol} from './lib/fair-launch-costs.js';
import {getWalletRegistry} from './lib/wallet-standard-registry.js';
import {getCompatibleSolanaWallets,sanitizeWalletName} from './lib/wallet-security.js';

export function initializeTokenCreator(root){
 if(!root)return;
 const by=id=>root.querySelector('[data-token="'+id+'"]');
 const journal=tokenCreatorJournal({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)});
 const registry=getWalletRegistry();let wallet=null,account=null,candidate=null,busy=false,choices=[];
 const status=by('status'),review=by('review'),approval=by('approval');
 function pending(){try{return journal.read();}catch{status.textContent='No se pudo leer la operación guardada. No repitas la creación.';return true;}}
 function controls(){const p=pending();by('prepare').disabled=busy||Boolean(p)||!account;by('submit').disabled=busy||Boolean(p)||!candidate||!approval.checked||Date.now()>=candidate.review.expiresAt;by('recover').hidden=!p;by('connect').disabled=busy||!choices.length;}
 function invalidate(){candidate=null;approval.checked=false;review.replaceChildren();controls();}
 function options(){choices=getCompatibleSolanaWallets(registry.get());by('wallets').replaceChildren(...choices.map(({name},i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=name;return option;}));by('connect').disabled=!choices.length||busy;}
 registry.on('register',options);registry.on('unregister',options);options();
 for(const field of root.querySelectorAll('input:not([type="checkbox"])'))field.addEventListener('input',invalidate);
 approval.addEventListener('change',controls);
 by('preset').onclick=()=>{by('name').value='JamdDmaj';by('symbol').value='JAMD';by('supply').value='100000000';by('decimals').value='6';invalidate();};
 by('connect').onclick=async()=>{try{
  invalidate();wallet=choices[Number(by('wallets').value)]?.wallet;if(!wallet)throw Error('No se detectó una wallet compatible.');
  const result=await wallet.features['standard:connect'].connect();account=result.accounts?.find(a=>a.chains?.includes('solana:mainnet'))||null;
  if(!account)throw Error('La wallet no ofrece una cuenta de Solana mainnet.');
  status.textContent=`${sanitizeWalletName(wallet.name)} · ${account.address} · Solana mainnet`;
 }catch(error){wallet=null;account=null;status.textContent=error.message;}controls();};
 async function exclusive(task){
  if(!navigator.locks?.request){status.textContent='Este navegador no permite proteger la operación entre pestañas. No se abrió la wallet.';return;}
  await navigator.locks.request('jamd.tokenCreator.mainnet',{mode:'exclusive',ifAvailable:true},async lock=>{
   if(!lock){status.textContent='Hay otra revisión abierta. Termínala antes de continuar.';return;}
   busy=true;controls();try{await task();}catch(error){candidate=null;approval.checked=false;status.textContent=(pending()?'Hay una operación pendiente. Consulta el resultado; no vuelvas a crear el token. ':'No se completó la operación. ')+String(error.message||'TOKEN_ERROR');}finally{busy=false;controls();}
  });
 }
 by('prepare').onclick=()=>exclusive(async()=>{
  invalidate();candidate=await prepareTokenCreation({identity:{name:by('name').value,symbol:by('symbol').value,supply:by('supply').value,decimals:by('decimals').value},wallet,account,journal});
  const r=candidate.review;review.replaceChildren();
  for(const text of ['SOLANA MAINNET · SOL real',`${r.name} (${r.symbol}) · ${r.supply} tokens · ${r.decimals} decimales`,`Recibe todo el suministro: ${r.recipient}`,`Red: ${formatTestSol(r.networkFeeLamports)} SOL · Reservas de cuentas: ${formatTestSol(r.accountReservesLamports)} SOL`,`Total estimado: ${formatTestSol(r.estimatedTotalLamports)} SOL · Comisión JamdDmaj: 0 SOL`,'Emisión adicional y congelación desactivadas; nombre y símbolo inmutables.','Sin pool, sin precio garantizado, sin vesting y sin distribución automática. Todo el suministro queda en tu wallet.','Revisión válida 45 segundos. Revisa también lo que muestre tu wallet.']){
   const line=document.createElement('p');line.textContent=text;review.append(line);
  }
  status.textContent='Revisa los datos. Preparar no firma ni envía.';
 });
 by('submit').onclick=()=>exclusive(async()=>{
  if(!candidate||!approval.checked)throw Error('TOKEN_APPROVAL_REQUIRED');
  const prepared=candidate;candidate=null;approval.checked=false;
  const r=await prepared.approveAndSubmit({explicitApproval:true});status.textContent=`Enviada; confirmación pendiente. ${r.signature}`;
 });
 by('recover').onclick=()=>exclusive(async()=>{
  const r=await readTokenCreation(journal);if(!r)return;
  status.textContent=r.state==='confirmed'?`Token confirmado: ${r.mint}`:r.state==='failed'?'La red rechazó la operación. Consulta el historial de tu wallet.':r.state==='expired'?'La operación venció sin creación confirmada. Puedes preparar otra revisión.':'Resultado todavía pendiente. Consultar no reenvía.';
  if(r.state==='confirmed'){const link=document.createElement('a');link.href='https://explorer.solana.com/address/'+encodeURIComponent(r.mint);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver token en Solana Explorer';status.append(document.createTextNode(' '),link);}
 });
 controls();
 const timer=setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}controls();},1000);
}
