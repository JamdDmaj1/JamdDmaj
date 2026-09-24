import {registerPlugin} from '@capacitor/core';

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
