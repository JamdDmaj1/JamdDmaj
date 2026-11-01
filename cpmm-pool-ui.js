import {prepareCpmmPool,readCpmmResult,cpmmJournal,CPMM} from './lib/cpmm-pool.js';
import {getWalletRegistry} from './lib/wallet-standard-registry.js';
import {getCompatibleSolanaWallets,sanitizeWalletName} from './lib/wallet-security.js';
import {formatTestSol} from './lib/fair-launch-costs.js';

export function initializeCpmmPool(root){
 if(!root)return;const el=n=>root.querySelector('[data-pool="'+n+'"]');
 const journal=cpmmJournal(localStorage),registry=getWalletRegistry();
 let choices=[],wallet=null,account=null,candidate=null,busy=false;
 const pending=()=>{try{return journal.read();}catch{el('status').textContent='No se pudo leer la operación pendiente. No repitas el envío.';return true;}};
 function controls(){const p=pending();el('prepare').disabled=busy||Boolean(p)||!account;el('submit').disabled=busy||Boolean(p)||!candidate||!el('approval').checked||Date.now()>=candidate.review.expiresAt;el('connect').disabled=busy||!choices.length;el('recover').hidden=!p;}
 function invalidate(){candidate=null;el('approval').checked=false;el('review').replaceChildren();controls();}
 function options(){choices=getCompatibleSolanaWallets(registry.get());el('wallets').replaceChildren(...choices.map(({name},i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=name;return o;}));controls();}
 registry.on('register',options);registry.on('unregister',options);options();
 const messages={POOL_INSUFFICIENT_TOKENS:'La wallet no tiene los dos importes disponibles.',POOL_TOKEN_ACCOUNT:'Necesitas saldo del token y USDC en las cuentas asociadas de esta wallet.',POOL_MINT_AUTHORITIES:'Este formulario requiere un token con emisión adicional y congelación desactivadas.',POOL_UNSUPPORTED_EXTENSION:'Este token tiene extensiones no compatibles con esta integración.',POOL_SIMULATION:'La simulación falló; no se pidió ninguna firma.',POOL_NETWORK:'No se pudo verificar Solana mainnet.',POOL_AMOUNT:'Introduce cantidades positivas, sin notación científica.',POOL_PRECISION:'La cantidad tiene más decimales de los permitidos.',POOL_CONFIG_CHANGED:'La configuración del mercado cambió. Prepara otra revisión.'};
 async function exclusive(task){
  if(!navigator.locks?.request){el('status').textContent='Este navegador no ofrece protección entre pestañas. No se solicitó firma.';return;}
  await navigator.locks.request('jamd.cpmm.mainnet',{mode:'exclusive',ifAvailable:true},async lock=>{
   if(!lock){el('status').textContent='Otra pestaña está revisando una aportación.';return;}
   busy=true;controls();try{await task();}catch(e){candidate=null;el('approval').checked=false;el('status').textContent=(pending()?'Hay una operación pendiente: consulta el resultado y no repitas. ':'')+(messages[e.message]||'No se completó la operación.')+' · '+String(e.message||'POOL_ERROR');}finally{busy=false;controls();}
  });
 }
 for(const n of ['mint','tokens','usdc'])el(n).addEventListener('input',invalidate);
 el('approval').addEventListener('change',controls);
 el('connect').onclick=async()=>{try{invalidate();wallet=choices[Number(el('wallets').value)]?.wallet;if(!wallet)throw Error('POOL_WALLET');const r=await wallet.features['standard:connect'].connect();account=r.accounts?.find(a=>a.chains?.includes('solana:mainnet'));if(!account)throw Error('POOL_WALLET');el('status').textContent=sanitizeWalletName(wallet.name)+' · '+account.address+' · Solana mainnet';}catch(e){account=null;el('status').textContent='No se conectó una wallet compatible de Solana mainnet.';}controls();};
 el('prepare').onclick=()=>exclusive(async()=>{
  invalidate();candidate=await prepareCpmmPool({mint:el('mint').value.trim(),tokenAmount:el('tokens').value.trim(),usdcAmount:el('usdc').value.trim(),wallet,account,journal});
  const r=candidate.review;
  const ratio=Number(r.usdcAmount)/Number(r.tokenAmount);
  const lines=[r.kind==='create'?'CREAR POOL · SOLANA MAINNET':'AÑADIR AL POOL EXISTENTE · SOLANA MAINNET',
   'Wallet que aporta y recibe la participación LP: '+r.owner,'Token: '+r.mint,'Pool: '+r.pool,'Programa Raydium CPMM: '+CPMM,
   'Disponible: '+r.tokenBalance+' tokens · '+r.usdcBalance+' USDC',
   (r.kind==='create'?'Aportación inicial: ':'Máximo autorizado: ')+r.tokenAmount+' tokens + '+r.usdcAmount+' USDC',
   r.kind==='create'?'Proporción inicial: '+ratio.toPrecision(8)+' USDC/token. No garantiza un valor de venta.':'Depósito proporcional al pool. Las cantidades introducidas son máximos, no un precio nuevo.',
   'Participación LP mínima: '+r.minimumLpBaseUnits+' unidades base (9 decimales).',
   'Red: '+formatTestSol(r.networkFeeLamports)+' SOL · Creación Raydium: '+formatTestSol(r.creationFeeLamports)+' SOL · Reservas: '+formatTestSol(r.accountReservesLamports)+' SOL',
   'Total SOL estimado: '+formatTestSol(r.totalSolLamports)+' · además de los tokens y USDC aportados. Comisión JamdDmaj por esta aportación: 0.',
   'Comisión ordinaria del mercado: '+(Number(r.dexTradeFeePpm)/10000)+'% por intercambio, según configuración consultada.',
   'SIN BLOQUEO: los LP quedan en tu wallet. No activa la comisión de compra del 1%, ni el bloqueo permanente ni la distribución de JAMD.',
   'Riesgo de pérdida y variación de la composición del pool. Revisión válida 45 segundos.'];
  el('review').replaceChildren(...lines.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
  el('status').textContent='Solo revisión y simulación. No se firmó ni envió.';
 });
 el('submit').onclick=()=>exclusive(async()=>{if(!candidate||!el('approval').checked)throw Error('POOL_APPROVAL');const c=candidate;candidate=null;el('approval').checked=false;const r=await c.approveAndSubmit({explicitApproval:true});el('status').textContent='Operación enviada, pendiente de confirmación. '+r.signature;});
 el('recover').onclick=()=>exclusive(async()=>{const r=await readCpmmResult(journal);if(!r)return;el('status').textContent=r.state==='confirmed'?'Aportación confirmada. LP sin bloqueo. Pool: '+r.pool:r.state==='failed'?'La red rechazó la operación; puede haber cobrado la comisión de red.':r.state==='expired'?'La creación venció sin pool confirmado.':'Resultado incierto o pendiente. Consultar no reenvía.';
  if(r.state==='confirmed'){const a=document.createElement('a');a.href='https://explorer.solana.com/address/'+encodeURIComponent(r.pool);a.target='_blank';a.rel='noopener noreferrer';a.textContent=' Ver pool';el('status').append(a);}
 });
 controls();const timer=setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}controls();},1000);
}
