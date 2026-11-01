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
 function pending(){try{return journal.read();}catch{status.textContent='No se pudo leer la operación guardada. No repitas la creación.';return true;}}
 function controls(){const p=pending();by('prepare').disabled=busy||Boolean(p)||!account;by('submit').disabled=busy||Boolean(p)||!candidate||!approval.checked||Date.now()>=candidate.review.expiresAt||!nameCheck||nameCheck.status!=='no-indexed-match'||Date.now()>=nameCheck.expiresAt;by('check-name').disabled=busy||Boolean(p);by('recover').hidden=!p;by('connect').disabled=busy||!choices.length;}
 function invalidate(clearName=true){revision++;candidate=null;approval.checked=false;review.replaceChildren();if(clearName){nameCheck=null;by('name-results').replaceChildren();}controls();}
 function options(){choices=getCompatibleSolanaWallets(registry.get());by('wallets').replaceChildren(...choices.map(({name},i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=name;return option;}));by('connect').disabled=!choices.length||busy;}
 registry.on('register',options);registry.on('unregister',options);options();
 for(const field of root.querySelectorAll('input:not([type="checkbox"])'))field.addEventListener('input',invalidate);
 approval.addEventListener('change',controls);
 by('preset').onclick=()=>{by('name').value='JamdDmaj';by('symbol').value='JAMD';by('supply').value='100000000';by('decimals').value='6';invalidate();};
 by('connect').onclick=async()=>{try{
  invalidate(false);wallet=choices[Number(by('wallets').value)]?.wallet;if(!wallet)throw Error('No se detectó una wallet compatible.');
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
 function renderNames(result){
  const box=by('name-results');box.replaceChildren();
  const p=document.createElement('p');
  p.textContent=result.status==='duplicate'?'Nombre o símbolo ya detectado. Elige otro para crear desde JamdDmaj.':result.status==='no-indexed-match'?'Sin coincidencias en las fuentes consultadas. Esto NO reserva el nombre ni garantiza exclusividad en Solana.':'No se pudo completar la búsqueda. No se puede declarar disponible; vuelve a comprobar.';
  box.append(p);
  for(const m of result.matches.slice(0,10)){const row=document.createElement('p'),link=document.createElement('a');
   row.append(document.createTextNode(`${m.name} (${m.symbol}) · ${m.nameMatch?'nombre coincidente':''}${m.nameMatch&&m.symbolMatch?' y ':''}${m.symbolMatch?'símbolo coincidente':''} · `));
   link.textContent=m.mint;link.href='https://explorer.solana.com/address/'+encodeURIComponent(m.mint);link.target='_blank';link.rel='noopener noreferrer';row.append(link);box.append(row);
  }
  const foot=document.createElement('p');foot.textContent='Identidad real: dirección mint, no nombre ni símbolo. Los resultados no verifican legitimidad y pueden omitir tokens recientes o no indexados.';box.append(foot);
  if(result.sources?.length){const sourceLine=document.createElement('p');sourceLine.textContent='Fuentes: '+result.sources.map(s=>s.source+(s.available?' · consultada':' · no disponible')).join(' / ');box.append(sourceLine);}
 }
 async function checkNames(identity=checkedTokenName({name:by('name').value,symbol:by('symbol').value}),generation=revision){
  const local=localTokenNameMatches(identity,localStorage);let remote;
  status.textContent='Comprobando nombre y símbolo en índices públicos…';
  try{
   const url=new URL('https://www.jamddmaj.com/api/token-name-check');url.search=new URLSearchParams(identity).toString();
   const response=await fetch(url,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(18000)});remote=await response.json();
   if(remote.network!=='solana:mainnet'||remote.name!==identity.name||remote.symbol!==identity.symbol||!['duplicate','no-indexed-match','unavailable'].includes(remote.status)||!Array.isArray(remote.matches)||!Number.isSafeInteger(remote.checkedAt)||!Number.isSafeInteger(remote.expiresAt)||remote.expiresAt<=Date.now()||remote.expiresAt-remote.checkedAt>120000||Math.abs(Date.now()-remote.checkedAt)>300000)throw Error('TOKEN_NAME_RESPONSE');
  }catch{remote={status:'unavailable',matches:[],expiresAt:0};}
  if(revision!==generation)throw Error('TOKEN_NAME_CHANGED');
  const matches=findTokenNameMatches(identity,[...local.map(m=>({...m,source:'Creación confirmada en este dispositivo'})),...remote.matches.map(m=>({...m,source:'Índices públicos'}))]);
  nameCheck={status:matches.length?'duplicate':remote.status==='no-indexed-match'?'no-indexed-match':'unavailable',matches,expiresAt:remote.expiresAt,sources:remote.sources};
  renderNames(nameCheck);controls();
  if(nameCheck.status==='duplicate')throw Error('TOKEN_NAME_DUPLICATE');
  if(nameCheck.status!=='no-indexed-match')throw Error('TOKEN_NAME_LOOKUP_UNAVAILABLE');
  return identity;
 }
 by('check-name').onclick=()=>exclusive(async()=>{await checkNames();status.textContent='Comprobación completada. No se firmó ni envió nada.';});
 by('prepare').onclick=()=>exclusive(async()=>{
  invalidate(false);const generation=revision,identity={...checkedTokenName({name:by('name').value,symbol:by('symbol').value}),supply:by('supply').value,decimals:by('decimals').value};
  await checkNames({name:identity.name,symbol:identity.symbol},generation);
  const prepared=await prepareTokenCreation({identity,wallet,account,journal});
  if(generation!==revision)throw Error('TOKEN_NAME_CHANGED');candidate=prepared;
  const r=candidate.review;review.replaceChildren();
  for(const text of ['SOLANA MAINNET · SOL real',`${r.name} (${r.symbol}) · ${r.supply} tokens · ${r.decimals} decimales`,`Recibe todo el suministro: ${r.recipient}`,`Red: ${formatTestSol(r.networkFeeLamports)} SOL · Reservas de cuentas: ${formatTestSol(r.accountReservesLamports)} SOL`,`Total estimado: ${formatTestSol(r.estimatedTotalLamports)} SOL · Comisión JamdDmaj: 0 SOL`,'Emisión adicional y congelación desactivadas; nombre y símbolo inmutables.','Sin pool, sin precio garantizado, sin vesting y sin distribución automática. Todo el suministro queda en tu wallet.','Revisión válida 45 segundos. Revisa también lo que muestre tu wallet.']){
   const line=document.createElement('p');line.textContent=text;review.append(line);
  }
  status.textContent='Revisa los datos. Preparar no firma ni envía.';
 });
 by('submit').onclick=()=>exclusive(async()=>{
  if(!candidate||!approval.checked)throw Error('TOKEN_APPROVAL_REQUIRED');
  const prepared=candidate;candidate=null;approval.checked=false;
  await checkNames({name:prepared.review.name,symbol:prepared.review.symbol},revision);
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
