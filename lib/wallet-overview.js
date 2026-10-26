import {selectedWalletAccount,currentWalletPortfolio,selectWalletAccount,walletAccounts} from './wallet-portfolio-store.js';
import QRCode from 'qrcode';

export function setupWalletOverview(language,doc=document,win=window){
 const host=doc.getElementById('terminal-assets');if(!host)return()=>{};
 const t=(es,en)=>language==='es'?es:en;
 const node=(tag,text)=>{const value=doc.createElement(tag);if(text)value.textContent=text;return value;};
 const card=node('section');card.id='wallet-portfolio-overview';card.className='card account-overview wallet-overview';
 const title=node('h2',t('Tu portafolio','Your portfolio')),total=node('strong','—'),note=node('p');total.className='wallet-total-usd';
 const actions=node('div');actions.className='wallet-quick-actions';
 const swapStatus=node('p');swapStatus.setAttribute('role','status');swapStatus.setAttribute('aria-live','polite');
 let swapAccount='';
 const openSwap=()=>{
  const account=selectedWalletAccount(doc);
  if(!account){swapStatus.textContent=t('Selecciona una billetera primero.','Select a wallet first.');return;}
  if(account.source!=='native'){
   swapStatus.textContent=account.source==='watch'?
    t('Esta dirección está vinculada solo para consulta. No autoriza swaps. Si es la billetera exclusiva del bot, su intercambio necesita revisión y firma en el servidor; no puede usar la clave de tu billetera Android. No se movieron fondos.',
      'This address is linked for viewing only. It does not authorize swaps. If it is the dedicated bot wallet, its swap needs server review and signing; it cannot use your Android wallet key. No funds moved.'):
    t('La billetera externa seleccionada necesita su propio flujo de intercambio y aprobación. No se abrirá otra cuenta ni se moverán fondos.',
      'The selected external wallet needs its own swap and approval flow. Another account will not be opened and no funds will move.');return;
  }
  const Type=doc.defaultView?.Event||win.Event||globalThis.Event;
  if(Type&&doc.dispatchEvent){swapStatus.textContent=t('Abriendo el intercambio seguro de la billetera nativa seleccionada. Revisa la cuenta y el importe antes de aprobar.','Opening the selected native wallet secure swap. Check the account and amount before approval.');doc.dispatchEvent(new Type('jamd-wallet-open-swap'));}
 };
 const receive=node('details'),wallets=node('details'),rows=node('div');rows.className='wallet-portfolio-tokens';
 receive.append(node('summary',t('Recibir en Solana','Receive on Solana')));const address=node('p');address.className='wallet-receive-address';
 const copy=node('button',t('Copiar dirección','Copy address'));copy.type='button';
 copy.onclick=async()=>{const account=selectedWalletAccount(doc);if(!account)return;try{await win.navigator.clipboard.writeText(account.address);note.textContent=t('Dirección copiada. Solo red Solana.','Address copied. Solana network only.');}catch{note.textContent=t('Selecciona y copia la dirección mostrada.','Select and copy the address shown.');}};
 const qr=node('canvas');qr.className='wallet-receive-qr';qr.setAttribute('role','img');qr.setAttribute('aria-label',t('QR de la dirección Solana seleccionada','QR for the selected Solana address'));qr.hidden=true;
 let qrAddress='';
 receive.append(qr,address,copy,node('p',t('Recibe SOL o tokens de Solana en esta dirección. Comprueba siempre la red y el token; las transferencias no se revierten.','Receive SOL or Solana tokens at this address. Always verify the network and token; transfers cannot be reversed.')));
 wallets.append(node('summary',t('Billeteras vinculadas','Linked wallets')));const choices=node('div');wallets.append(choices);
 for(const [label,action] of [[t('Recibir','Receive'),()=>{receive.open=!receive.open;}],['Swap',openSwap],
  [t('Enviar','Send'),()=>{const account=selectedWalletAccount(doc);if(account?.source==='native')doc.querySelector?.('#native-main-wallet button')?.click?.();else doc.getElementById('external-wallet-assets')?.scrollIntoView?.({block:'center'});}],
  [t('Billeteras','Wallets'),()=>{wallets.open=!wallets.open;}]]){
  const button=node('button',label);button.type='button';button.onclick=action;actions.append(button);
 }
 card.append(title,total,note,actions,swapStatus,wallets,receive,rows);host.prepend(card);
 const money=value=>new Intl.NumberFormat(language,{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
 const render=()=>{
  const account=selectedWalletAccount(doc),data=currentWalletPortfolio(doc),age=Date.now()-Date.parse(data?.updatedAt);
  const accountKey=account?account.source+':'+account.address:'';if(accountKey!==swapAccount){swapAccount=accountKey;swapStatus.textContent='';}
  const fresh=data&&Number.isFinite(age)&&age>=-5000&&age<=120000;
  title.textContent=account?account.name:t('Tu portafolio','Your portfolio');address.textContent=account?.address||t('Selecciona una billetera primero.','Select a wallet first.');
  if(qrAddress!==(account?.address||'')){
   qrAddress=account?.address||'';qr.hidden=true;
   if(qrAddress&&typeof qr.getContext==='function'){const requested=qrAddress;QRCode.toCanvas(qr,requested,{width:224,margin:4,errorCorrectionLevel:'M'},error=>{qr.hidden=Boolean(error)||qrAddress!==requested;});}
  }
  total.textContent=fresh&&Number.isFinite(data.estimatedValueUsd)?'≈ '+money(data.estimatedValueUsd):'—';
  note.textContent=!account?t('Elige tu billetera JamdDmaj o conecta una externa.','Choose your JamdDmaj wallet or connect an external wallet.'):
   !fresh?t('Consultando saldo de la cuenta seleccionada…','Checking the selected account balance…'):
   data.partial||data.valuationCoverage<1?t('Valor estimado parcial: algunos precios o tokens no están disponibles.','Partial estimated value: some token balances or prices are unavailable.'):
   t('Valor estimado en USD · no es saldo en dólares bancarios.','Estimated USD value · not a bank-dollar balance.');
  receive.hidden=!account;rows.replaceChildren();choices.replaceChildren();
  for(const saved of walletAccounts(doc)){
   const button=node('button',saved.name+' · '+saved.address.slice(0,4)+'…'+saved.address.slice(-4));button.type='button';
   button.setAttribute('aria-pressed',String(account?.source===saved.source&&account?.address===saved.address));
   button.onclick=()=>{selectWalletAccount(doc,saved);const Type=win.Event||globalThis.Event;if(Type&&doc.dispatchEvent)doc.dispatchEvent(new Type('jamd-wallet-refresh'));};choices.append(button);
  }
  if(!fresh)return;
  const tokens=[{symbol:'SOL',...data.sol},...(Array.isArray(data.tokens)?data.tokens:[])];
  for(const token of tokens.slice(0,100)){
   if(!Number.isFinite(token.amount)||token.amount<=0)continue;
   const row=node('div');row.className='wallet-token-row';
   const name=node('strong',String(token.symbol||token.mint||'Token').slice(0,44));
   const quantity=node('span',token.amount.toLocaleString(language,{maximumSignificantDigits:10}));
   const valuation=node('small',Number.isFinite(token.priceUsd)&&token.priceUsd>0&&Number.isFinite(token.valueUsd)?money(token.valueUsd):t('Precio no disponible','Price unavailable'));
   row.append(name,quantity,valuation);rows.append(row);
  }
 };
 doc.addEventListener?.('jamd-wallet-portfolio',render);render();
 const timer=setInterval(render,60000);timer?.unref?.();
 return()=>{clearInterval(timer);doc.removeEventListener?.('jamd-wallet-portfolio',render);card.remove();};
}
