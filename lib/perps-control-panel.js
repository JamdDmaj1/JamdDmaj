// Owner-authenticated controls, distinct from a local draft and from the main
// wallet. Loading or saving settings never activates the financial worker.
export function setupPerpsControlPanel({panel,fields,client,validateSettings,language,doc}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const value=doc.createElement(tag);if(text)value.textContent=text;return value;};
 const section=node('section');section.className='card';section.append(node('h3',t('Servidor de automatización 24/7','24/7 automation server')));
 const status=node('p',t('Conecta tu sesión de JamdDmaj para consultar la billetera exclusiva y sus límites. No se usa tu saldo principal como capital del bot.','Connect your JamdDmaj session to read the exclusive wallet and its limits. Your main wallet balance is not treated as bot capital.'));status.setAttribute('role','status');
 const identity=node('p'),connect=node('button',t('Consultar servidor','Read server settings')),save=node('button',t('Guardar límites y pausar','Save limits and pause')),pause=node('button',t('Pausar nuevas entradas','Pause new entries'));
 const consent=node('input');consent.type='checkbox';consent.checked=false;
 const consentLabel=node('label');consentLabel.className='finance-setting';consentLabel.append(consent,node('span',t('Acepto una billetera exclusiva custodiada por el servidor, solo con el capital que asigne. Es independiente de mi billetera principal.','I accept a dedicated server-custodied wallet funded only with the capital I assign. It is separate from my main wallet.')));
 const provision=node('button',t('Preparar billetera del bot','Prepare bot wallet'));
 for(const button of [connect,save,pause,provision])button.type='button';let current=null,busy=false,confirmedEmpty=false;
 const values=()=>Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value]));
 function render(){connect.disabled=busy;save.disabled=busy||current===null;pause.disabled=busy||current===null;
  consent.disabled=busy||!confirmedEmpty||current!==null;provision.disabled=busy||!confirmedEmpty||current!==null||consent.checked!==true||typeof client.provision!=='function';}
 consent.onchange=render;
 function show(value){
  current=value;confirmedEmpty=value===null;
  identity.textContent=value?t('Billetera exclusiva: ','Exclusive wallet: ')+value.walletAddress:'';
  status.textContent=value?(value.enabled&&!value.paused?t('El servidor informa automatización activa. Puedes pausarla aquí.','The server reports active automation. You can pause it here.'):t('Automatización desactivada o pausada en el servidor. Guardar límites no la activa.','Automation is inactive or paused on the server. Saving limits does not activate it.')):t('Tu cuenta aún no tiene una billetera exclusiva aprovisionada. No deposites en una dirección de prueba.','Your account does not yet have a provisioned exclusive wallet. Do not deposit into a test address.');
 }
 function error(failure,action){
  if(failure?.code==='invalid-settings'){
   const messages={
    capital:t('Capital máximo: escribe al menos 10 USDC.','Maximum capital: enter at least 10 USDC.'),
    loss:t('Pérdida diaria: escribe un límite mayor que cero y no superior al capital máximo.','Daily loss: enter a limit greater than zero and no higher than maximum capital.'),
    positions:t('Posiciones simultáneas: escribe un número entero entre 1 y 10.','Concurrent positions: enter a whole number from 1 to 10.'),
    margin:t('Margen por trade: escribe al menos 10 USDC y no más que el capital máximo.','Margin per trade: enter at least 10 USDC and no more than maximum capital.'),
    leverage:t('Apalancamiento: entre 1,1× y 50×, en pasos de 0,1.','Leverage: from 1.1× to 50×, in steps of 0.1.'),
    dailyTrades:t('Trades diarios: escribe un número entero entre 1 y 100.','Daily trades: enter a whole number from 1 to 100.'),
    stopLossPercent:t('Stop loss: deja vacío para usar la señal, o escribe un porcentaje mayor que 0 y menor que 100. Cero no es válido.','Stop loss: leave blank to use the signal, or enter a percentage above 0 and below 100. Zero is not valid.'),
    takeProfitPercent:t('Take profit: deja vacío para usar la señal, o escribe un porcentaje mayor que 0 y menor que 10000.','Take profit: leave blank to use the signal, or enter a percentage above 0 and below 10000.'),
    reductionPercent:t('Reducción: escribe un porcentaje mayor que 0 y menor que 100.','Reduction: enter a percentage above 0 and below 100.'),
    lossAction:t('Selecciona qué hacer al alcanzar la pérdida diaria.','Select what to do when the daily loss limit is reached.')
   };
   if(Object.hasOwn(messages,failure.field)&&fields[failure.field]){
    const input=fields[failure.field];input.setAttribute?.('aria-invalid','true');
    const details=input.closest?.('details');if(details)details.open=true;
    input.focus?.();input.scrollIntoView?.({block:'center',behavior:'auto'});
    status.textContent=messages[failure.field]+' '+t('No se guardaron cambios.','No changes were saved.');return;
   }
   status.textContent=t('Revisa capital, margen, apalancamiento, SL/TP y límites antes de guardar. No se enviaron cambios.','Check capital, margin, leverage, SL/TP and limits before saving. No changes were sent.');return;
  }
  if(failure?.code==='custody-approval-required'){status.textContent=t('Confirma que aceptas la custodia separada antes de preparar la billetera.','Confirm separate custody consent before preparing the wallet.');return;}
  current=null;confirmedEmpty=false;identity.textContent='';
  status.textContent=failure?.code==='login-required'||failure?.code==='session-changed'?t('Inicia sesión de nuevo con Google en JamdDmaj. No necesitas introducir claves de tu billetera.','Sign in again with Google in JamdDmaj. No wallet keys are needed.'):
   failure?.code==='settings-changed'?t('La configuración cambió en el servidor. Consúltala de nuevo antes de guardar.','Server settings changed. Read them again before saving.'):
   failure?.code==='custody-unavailable'?t('La preparación de billeteras aún no está habilitada en el servidor. No se creó una billetera ni se habilitaron depósitos.','Wallet setup is not yet enabled on the server. No wallet was created and deposits were not enabled.'):
   action==='pause'?t('No se confirmó la pausa. No supongas que el bot se detuvo; consulta de nuevo el servidor.','Pause was not confirmed. Do not assume the bot stopped; check the server again.'):
   action==='provision'?t('No se pudo confirmar la preparación. Consulta de nuevo el servidor antes de repetirla. No deposites fondos.','Wallet setup was not confirmed. Read the server again before retrying. Do not deposit funds.'):
   t('No se pudo confirmar la conexión segura o guardar cambios en el servidor. Tu borrador local no activa el bot.','Could not verify the secure connection or save changes on the server. A local draft does not activate the bot.');
 }
 async function run(action,operation){if(busy)return;busy=true;for(const input of Object.values(fields))input.setAttribute?.('aria-invalid','false');render();try{await operation();}catch(failure){error(failure,action);}finally{busy=false;render();}}
 connect.onclick=()=>run('read',async()=>{
  const before=JSON.stringify(values()),result=typeof client.readStatus==='function'?await client.readStatus():{controls:await client.read(),recovery:null},value=result.controls;show(value);
  if(value&&result.recovery?.backupVerified===true)status.textContent=t('Respaldo cifrado verificado. La ejecución de trading aún no está habilitada. No deposites todavía.','Encrypted backup verified. Trading execution is not enabled yet. Do not deposit yet.');
  else if(value&&result.recovery?.backupVerified===false)status.textContent=t('Billetera preparada. Falta verificar el respaldo antes de habilitar depósitos o trading. No deposites todavía.','Wallet prepared. Backup verification is required before deposits or trading can be enabled. Do not deposit yet.');
  // An in-flight refresh must not overwrite edits typed while it was loading.
  if(value&&before===JSON.stringify(values()))for(const [key,input]of Object.entries(fields))input.value=value.settings[key]??'';
 });
 save.onclick=()=>run('save',async()=>{
  if(!current)throw Error();let settings;try{settings=validateSettings(values());}catch(failure){throw Object.assign(Error(),{code:'invalid-settings',field:failure?.field});}
  show(await client.save({walletAddress:current.walletAddress,expectedRevision:current.revision,settings}));
 });
 pause.onclick=()=>run('pause',async()=>{if(!current)throw Error();show(await client.pause({walletAddress:current.walletAddress}));});
 provision.onclick=()=>run('provision',async()=>{
  if(!confirmedEmpty||current!==null||consent.checked!==true)throw Object.assign(Error(),{code:'custody-approval-required'});
  let settings;try{settings=validateSettings(values());}catch(failure){throw Object.assign(Error(),{code:'invalid-settings',field:failure?.field});}
  const result=await client.provision({settings,explicitCustodyApproval:true});show(result.controls);consent.checked=false;
  status.textContent=t('Billetera exclusiva preparada y pausada. Falta verificar su respaldo antes de habilitar depósitos o trading. No deposites todavía.','Exclusive wallet prepared and paused. Backup verification is required before deposits or trading can be enabled. Do not deposit yet.');
 });
 section.append(connect,save,pause,consentLabel,provision,identity,status);panel.append(section);render();
 return Object.freeze({section,connect,save,pause,provision,consent,status,identity});
}
