import {registerPlugin} from '@capacitor/core';
import {selectWalletAccount,selectedWalletAccount,publishWalletPortfolio} from './lib/wallet-portfolio-store.js';

export function setupMainWalletEntry(language,doc=document,win=window,pluginFactory=()=>registerPlugin('NativeWallet')){
 const host=doc.getElementById('terminal-assets');if(!host)return()=>{};
 const t=(es,en)=>language==='es'?es:en;
 const panel=doc.createElement('section');panel.className='card';panel.id='native-main-wallet';
 const add=(tag,value)=>{const n=doc.createElement(tag);n.textContent=value;panel.append(n);return n};
 add('h2',t('Tu billetera JamdDmaj','Your JamdDmaj wallet'));
 add('p',t('Tu cuenta de Solana, integrada con Activos y Trade. Consultar el saldo no requiere huella; cada operación conserva su revisión y autorización nativa.','Your Solana account, shared with Assets and Trade. Viewing public balances does not require biometrics; transactions retain native review and approval.'));
 const button=add('button',t('Abrir mi billetera','Open my wallet'));button.type='button';
 const status=add('p','');status.setAttribute('role','status');
 const available=win.Capacitor?.isNativePlatform?.()&&win.Capacitor?.getPlatform?.()==='android'&&win.Capacitor?.isPluginAvailable?.('NativeWallet');
 button.hidden=!available;
 if(!available)status.textContent=t('Necesitas una versión Android compatible. Esta página no guarda claves ni crea billeteras ficticias.','A compatible Android build is required. This page does not store keys or create fictitious wallets.');
 let pending=false,disposed=false;
 let refreshing=false,timer;
 const refreshPublic=async()=>{
  if(!available||disposed||refreshing||selectedWalletAccount(doc)?.source==='external')return;
  refreshing=true;
  try{
   const plugin=pluginFactory();if(typeof plugin.getPublicAccount!=='function')return;
   const account=await plugin.getPublicAccount();
   if(disposed||selectedWalletAccount(doc)?.source==='external')return;
   if(account?.available!==true){if(selectedWalletAccount(doc)?.source==='native')selectWalletAccount(doc,null);return;}
   selectWalletAccount(doc,{address:account.address,source:'native',name:account.name||'JamdDmaj'});
   const selected=selectedWalletAccount(doc),base=win.Capacitor?.isNativePlatform?.()?'https://www.jamddmaj.com':'';
   const response=await fetch(base+'/api/solana-portfolio?address='+encodeURIComponent(account.address),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   const data=await response.json();const age=Date.now()-Date.parse(data.updatedAt);
   if(!response.ok||!Number.isFinite(age)||age< -5000||age>120000)throw Error('Invalid public balance');
   if(!disposed)publishWalletPortfolio(doc,data,selected);
  }catch{if(!disposed&&selectedWalletAccount(doc)?.source==='native')publishWalletPortfolio(doc,null,selectedWalletAccount(doc));}
  finally{refreshing=false;}
 };
 const visible=()=>{if(!doc.hidden)refreshPublic();};
 if(available){refreshPublic();timer=setInterval(visible,60000);timer?.unref?.();win.addEventListener?.('focus',visible);doc.addEventListener?.('visibilitychange',visible);doc.addEventListener?.('jamd-wallet-refresh',visible);}
 button.onclick=async()=>{if(!available||pending||disposed)return;pending=true;button.disabled=true;
  try{await pluginFactory().open();if(!disposed)status.textContent=t('Pantalla nativa abierta. No se envió ninguna operación desde esta página.','Native screen opened. No operation was sent from this page.');}
  catch{if(!disposed)status.textContent=t('No se pudo abrir la billetera. Requiere Android 11 o posterior y la versión compatible.','Could not open wallet. Android 11 or later and a compatible version are required.');}
  finally{pending=false;if(!disposed)button.disabled=false;}
 };
 host.prepend(panel);return()=>{disposed=true;clearInterval(timer);win.removeEventListener?.('focus',visible);doc.removeEventListener?.('visibilitychange',visible);doc.removeEventListener?.('jamd-wallet-refresh',visible);panel.remove()};
}

// Navigation only; native wallet never exports addresses, keys or signing to JS.
export function setupNativeWalletEntry(language,doc=document,win=window,pluginFactory=()=>registerPlugin('DevnetWallet')){
 const host=doc.getElementById('terminal-assets');if(!host)return()=>{};
 const t=(es,en)=>language==='es'?es:en;
 const panel=doc.createElement('section');panel.className='card';panel.id='native-devnet-wallet';
 const add=(tag,value)=>{const n=doc.createElement(tag);n.textContent=value;panel.append(n);return n};
 add('h2',t('Billetera JamdDmaj · Pruebas','JamdDmaj wallet · Testing'));
 add('p',t('Solo Solana devnet, sin dinero real. Crea o recupera un respaldo cifrado, recibe SOL de prueba y confirma cada envío con biometría en la pantalla nativa. Independiente de Bitget.','Solana devnet only, no real money. Create or recover an encrypted backup, receive test SOL and confirm each transfer with biometrics on the native screen. Independent of Bitget.'));
 const button=add('button',t('Abrir billetera de prueba','Open test wallet'));button.type='button';
 const status=add('p','');status.setAttribute('role','status');
 const available=win.Capacitor?.isNativePlatform?.()&&win.Capacitor?.getPlatform?.()==='android'&&win.Capacitor?.isPluginAvailable?.('DevnetWallet');
 button.hidden=!available;
 if(!available)status.textContent=t('Disponible únicamente en una versión Android compatible de JamdDmaj. Esta página no puede crear ni importar claves.','Available only in a compatible JamdDmaj Android build. This page cannot create or import keys.');
 else add('p',t('Wallet Lab y JamdDmaj guardan sus datos por separado. Para recuperar tu prueba, abre el respaldo desde la pantalla nativa; nunca lo subas al chat.','Wallet Lab and JamdDmaj store data separately. To recover your test wallet, open the backup on the native screen; never upload it to chat.'));
 let pending=false,disposed=false;
 button.onclick=async()=>{if(!available||pending||disposed)return;pending=true;button.disabled=true;status.textContent='';
  try{await pluginFactory().open();if(!disposed)status.textContent=t('Pantalla nativa abierta. No se envió ninguna orden desde esta página.','Native screen opened. This page did not submit any order.');}
  catch{if(!disposed)status.textContent=t('No se pudo abrir. Requiere Android 11 o posterior y la versión integrada; no se enviaron fondos.','Could not open. Requires Android 11 or later and the integrated build; no funds were sent.');}
  finally{pending=false;if(!disposed)button.disabled=false;}
 };
 host.prepend(panel);return()=>{disposed=true;panel.remove()};
}
