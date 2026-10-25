// Owner-authenticated controls, distinct from a local draft and from the main
// wallet. Loading or saving settings never activates the financial worker.
export function setupPerpsControlPanel({panel,fields,client,validateSettings,language,doc,onFundingStatus=()=>{}}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const value=doc.createElement(tag);if(text)value.textContent=text;return value;};
 const section=node('section');section.className='card';section.append(node('h3',t('Servidor de automatización 24/7','24/7 automation server')));
 const status=node('p',t('Conecta tu sesión de JamdDmaj para consultar la billetera exclusiva y sus límites. No se usa tu saldo principal como capital del bot.','Connect your JamdDmaj session to read the exclusive wallet and its limits. Your main wallet balance is not treated as bot capital.'));status.setAttribute('role','status');
 const identity=node('p'),connect=node('button',t('Consultar servidor','Read server settings')),save=node('button',t('Guardar límites y pausar','Save limits and pause')),pause=node('button',t('Desactivar bot · detener nuevas entradas','Disable bot · stop new entries'));
 const funds=node('p');funds.className='automation-server-funds';
 const clearFunds=()=>{funds.textContent='';onFundingStatus(null);};
 const amount=(value,decimals)=>{const text=String(value).padStart(decimals+1,'0'),fraction=text.slice(-decimals).replace(/0+$/,'');return text.slice(0,-decimals)+(fraction?'.'+fraction:'');};
 const consent=node('input');consent.type='checkbox';consent.checked=false;
 const consentLabel=node('label');consentLabel.className='finance-setting';consentLabel.append(consent,node('span',t('Acepto una billetera exclusiva custodiada por el servidor, solo con el capital que asigne. Es independiente de mi billetera principal.','I accept a dedicated server-custodied wallet funded only with the capital I assign. It is separate from my main wallet.')));
 const provision=node('button',t('Preparar billetera del bot','Prepare bot wallet'));
 const prepareActivation=node('button',t('Activar bot · revisar límites','Activate bot · review limits')),activate=node('button',t('Confirmar y activar el bot','Confirm and activate bot'));
 section.append(node('p',t('Los límites son ajustables. Guardarlos pausa nuevas entradas; después puedes revisar y confirmar la activación. Desactivar no cierra posiciones existentes.','Limits are adjustable. Saving pauses new entries; then you can review and confirm activation. Disabling does not close existing positions.')));
 const activationConsent=node('input');activationConsent.type='checkbox';activationConsent.checked=false;
 const activationLabel=node('label');activationLabel.className='finance-setting';activationLabel.append(activationConsent,node('span',t('Autorizo al bot a operar 24/7 con su billetera exclusiva y los límites revisados. Entiendo el riesgo de pérdida.','I authorize 24/7 trading from the dedicated bot wallet under the reviewed limits. I understand the risk of loss.')));
 const activationSummary=node('p');activationSummary.setAttribute('role','status');
 for(const button of [connect,save,pause,provision,prepareActivation,activate])button.type='button';let current=null,busy=false,confirmedEmpty=false,executionAvailable=false,backupVerified=false,activationReview=null,activationExpiry;
 function discardActivation(){activationReview=null;activationConsent.checked=false;activationSummary.textContent='';clearTimeout(activationExpiry);}
 const activationCurrent=()=>activationReview&&Date.now()<activationReview.expiresAt&&current?.walletAddress===activationReview.walletAddress&&current?.revision===activationReview.revision;
 const values=()=>Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value]));
 function render(){connect.disabled=busy;save.disabled=busy||current===null;pause.disabled=busy||current===null;
  consent.disabled=busy||!confirmedEmpty||current!==null;provision.disabled=busy||!confirmedEmpty||current!==null||consent.checked!==true||typeof client.provision!=='function';
  prepareActivation.disabled=busy||!current||current.enabled||!executionAvailable||!backupVerified||typeof client.prepareActivation!=='function';
  activationConsent.disabled=busy||!activationCurrent();activate.disabled=busy||!activationCurrent()||!activationConsent.checked||typeof client.activate!=='function';}
 consent.onchange=render;
 activationConsent.onchange=render;
 for(const input of Object.values(fields))input.addEventListener?.('input',()=>{discardActivation();render();});
 function show(value){
  discardActivation();executionAvailable=false;backupVerified=false;
  clearFunds();
  current=value;confirmedEmpty=value===null;
  identity.textContent=value?t('Billetera exclusiva: ','Exclusive wallet: ')+value.walletAddress:'';
  status.textContent=value?(value.enabled&&!value.paused?t('El servidor informa automatización activa. Puedes pausarla aquí.','The server reports active automation. You can pause it here.'):t('Automatización desactivada o pausada en el servidor. Guardar límites no la activa.','Automation is inactive or paused on the server. Saving limits does not activate it.')):t('Tu cuenta aún no tiene una billetera exclusiva aprovisionada. No deposites en una dirección de prueba.','Your account does not yet have a provisioned exclusive wallet. Do not deposit into a test address.');
 }
 async function refreshReadiness(){
  if(!current||typeof client.readStatus!=='function')return;
  const selected=current,result=await client.readStatus();
  if(current!==selected||result.controls?.walletAddress!==selected.walletAddress||result.controls?.revision!==selected.revision)throw Object.assign(Error(),{code:'settings-changed'});
  executionAvailable=result.executionAvailable===true;backupVerified=result.recovery?.backupVerified===true;
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
  discardActivation();executionAvailable=false;backupVerified=false;current=null;confirmedEmpty=false;identity.textContent='';clearFunds();
  status.textContent=failure?.code==='session-missing'?t('Esta pestaña no tiene una sesión de acceso. Tu perfil de Google puede estar guardado, pero no autoriza la consulta. En Inicio, pulsa el botón Google para renovar el acceso y vuelve desde el menú. Código: SESSION_MISSING.','This tab has no access session. A saved Google profile does not authorize this request. In Home, press the Google button to renew access, then return using the app menu. Code: SESSION_MISSING.'):
   failure?.code==='login-required'?t('La sesión llegó al servidor, pero fue rechazada. No es un problema de saldo ni de Phantom. Renueva el acceso con el botón Google en Inicio. Código: SESSION_REJECTED.','The session reached the server but was rejected. This is not a balance or Phantom issue. Renew access using the Google button in Home. Code: SESSION_REJECTED.'):
   failure?.code==='session-changed'?t('La sesión cambió durante la consulta. Consulta de nuevo; no se mostrará información de otra cuenta.','The session changed during the request. Read again; another account’s information will not be displayed.'):
   failure?.code==='settings-changed'?t('La configuración cambió en el servidor. Consúltala de nuevo antes de guardar.','Server settings changed. Read them again before saving.'):
   failure?.code==='custody-unavailable'?t('La preparación de billeteras aún no está habilitada en el servidor. No se creó una billetera ni se habilitaron depósitos.','Wallet setup is not yet enabled on the server. No wallet was created and deposits were not enabled.'):
   action==='activate'?t('Activación sin confirmar. Consulta el estado del servidor antes de cualquier otro intento; no se repetirá automáticamente.','Activation is unconfirmed. Read the server state before any other attempt; it will not be retried automatically.'):
   failure?.code==='execution-unavailable'?t('El servidor todavía no permite ejecución. No se activó el bot.','The server does not permit execution yet. The bot was not activated.'):
   action==='pause'?t('No se confirmó la pausa. No supongas que el bot se detuvo; consulta de nuevo el servidor.','Pause was not confirmed. Do not assume the bot stopped; check the server again.'):
   action==='provision'?t('No se pudo confirmar la preparación. Consulta de nuevo el servidor antes de repetirla. No deposites fondos.','Wallet setup was not confirmed. Read the server again before retrying. Do not deposit funds.'):
   t('No se pudo confirmar la conexión segura o guardar cambios en el servidor. Tu borrador local no activa el bot.','Could not verify the secure connection or save changes on the server. A local draft does not activate the bot.');
 }
 async function run(action,operation){if(busy)return;busy=true;for(const input of Object.values(fields))input.setAttribute?.('aria-invalid','false');render();try{await operation();}catch(failure){error(failure,action);}finally{busy=false;render();}}
 connect.onclick=()=>run('read',async()=>{
  clearFunds();
  const before=JSON.stringify(values()),result=typeof client.readStatus==='function'?await client.readStatus():{controls:await client.read(),recovery:null},value=result.controls;show(value);
  executionAvailable=result.executionAvailable===true;backupVerified=result.recovery?.backupVerified===true;
  if(value&&!value.enabled&&backupVerified)status.textContent=executionAvailable?t('Respaldo verificado. Revisa los límites y solicita una revisión antes de confirmar la activación.','Backup verified. Check limits and request a review before confirming activation.'):t('Respaldo cifrado verificado. La ejecución de trading aún no está habilitada. No deposites todavía.','Encrypted backup verified. Trading execution is not enabled yet. Do not deposit yet.');
  else if(value&&result.recovery?.backupVerified===false)status.textContent=t('Billetera preparada. Falta verificar el respaldo antes de habilitar depósitos o trading. No deposites todavía.','Wallet prepared. Backup verification is required before deposits or trading can be enabled. Do not deposit yet.');
  if(value&&result.funding?.stage==='OBSERVED_EXCLUSIVE_WALLET_FUNDS'){
   const snapshot=result.funding;
   onFundingStatus(snapshot);
   funds.textContent=t('Saldo observado del bot: ','Observed bot balance: ')+amount(snapshot.availableUsdcUnits,6)+' USDC · '+amount(snapshot.payerLamports,9)+' SOL. '+
    t('Margen configurado: ','Configured margin: ')+amount(snapshot.configuredMarginUsdcUnits,6)+' USDC. '+
    (snapshot.hasConfiguredCollateral?t('Este saldo no es una reserva ni una autorización para operar.','This balance is not a reservation or permission to trade.'):
     t('El saldo USDC no cubre el margen configurado.','The USDC balance does not cover the configured margin.'))+' '+
    (executionAvailable&&backupVerified?t('Activar requiere además una comprobación reciente del riesgo, respaldo y saldo en el servidor.','Activation also requires a fresh server risk, backup and funding check.'):t('Jupiter exige al menos 10 USDC de garantía; también se necesita SOL para comisiones. No deposites todavía.','Jupiter requires at least 10 USDC collateral; SOL is also needed for fees. Do not deposit yet.'));
  }else if(value)funds.textContent=t('Saldo del bot no verificado. No se sustituye por cero ni por el saldo de tu billetera principal o Phantom.','Bot balance is unverified. It is not replaced with zero or your main/Phantom wallet balance.');
  // An in-flight refresh must not overwrite edits typed while it was loading.
  if(value&&before===JSON.stringify(values()))for(const [key,input]of Object.entries(fields))input.value=value.settings[key]??'';
 });
 prepareActivation.onclick=()=>run('activationReview',async()=>{
  discardActivation();if(!current||current.enabled||!executionAvailable||!backupVerified)throw Object.assign(Error(),{code:'execution-unavailable'});
  const selected=current,before=JSON.stringify(validateSettings(values()));
  if(before!==JSON.stringify(validateSettings(selected.settings)))throw Object.assign(Error(),{code:'settings-changed'});
  const review=await client.prepareActivation({walletAddress:selected.walletAddress,expectedRevision:selected.revision});
  if(current!==selected||before!==JSON.stringify(validateSettings(values()))||JSON.stringify(validateSettings(review.settings))!==before)throw Object.assign(Error(),{code:'settings-changed'});
  activationReview=review;activationSummary.textContent=t('Capital máximo: ','Maximum capital: ')+review.settings.capital+' USDC · '+t('Margen: ','Margin: ')+review.settings.margin+' USDC · '+review.settings.leverage+'× · '+t('Posiciones: ','Positions: ')+review.settings.positions+' · '+t('Trades/día: ','Trades/day: ')+review.settings.dailyTrades+' · '+t('Pérdida/día: ','Daily loss: ')+review.settings.loss+' USDC · SL: '+(review.settings.stopLossPercent??'Telegram')+' · TP: '+(review.settings.takeProfitPercent??'Telegram');
  const lossActions={disable:t('Desactivar','Disable'),'reduce-leverage':t('Pausar y reducir apalancamiento','Pause and reduce leverage'),'reduce-margin':t('Pausar y reducir margen','Pause and reduce margin')};
  activationSummary.textContent+=' · '+t('Al alcanzar la pérdida: ','At the daily loss limit: ')+(lossActions[review.settings.lossAction]??review.settings.lossAction)+
   (review.settings.lossAction==='disable'?'':' · '+review.settings.reductionPercent+'%')+'. '+t('No se reanuda automáticamente.','No automatic restart.');
  activationExpiry=setTimeout(()=>{discardActivation();render();},Math.max(1,review.expiresAt-Date.now()));activationExpiry?.unref?.();
  status.textContent=t('Revisión preparada. Aún no está activo: confirma el consentimiento y pulsa activar antes de que caduque.','Review prepared. Not active yet: confirm consent and press activate before expiry.');
 });
 activate.onclick=()=>run('activate',async()=>{
  if(!activationCurrent()||activationConsent.checked!==true)throw Object.assign(Error(),{code:'activation-review-expired'});
  const review=activationReview;if(JSON.stringify(validateSettings(values()))!==JSON.stringify(validateSettings(review.settings)))throw Object.assign(Error(),{code:'settings-changed'});
  discardActivation();show(await client.activate({review,explicitApproval:true}));
 });
 save.onclick=()=>run('save',async()=>{
  if(!current)throw Error();let settings;try{settings=validateSettings(values());}catch(failure){throw Object.assign(Error(),{code:'invalid-settings',field:failure?.field});}
  show(await client.save({walletAddress:current.walletAddress,expectedRevision:current.revision,settings}));
  await refreshReadiness();
 });
 pause.onclick=()=>run('pause',async()=>{if(!current)throw Error();show(await client.pause({walletAddress:current.walletAddress}));await refreshReadiness();});
 provision.onclick=()=>run('provision',async()=>{
  if(!confirmedEmpty||current!==null||consent.checked!==true)throw Object.assign(Error(),{code:'custody-approval-required'});
  let settings;try{settings=validateSettings(values());}catch(failure){throw Object.assign(Error(),{code:'invalid-settings',field:failure?.field});}
  const result=await client.provision({settings,explicitCustodyApproval:true});show(result.controls);consent.checked=false;
  status.textContent=t('Billetera exclusiva preparada y pausada. Falta verificar su respaldo antes de habilitar depósitos o trading. No deposites todavía.','Exclusive wallet prepared and paused. Backup verification is required before deposits or trading can be enabled. Do not deposit yet.');
 });
 section.append(connect,save,pause,consentLabel,provision,identity,funds,status,prepareActivation,activationSummary,activationLabel,activate);panel.append(section);render();
 return Object.freeze({section,connect,save,pause,provision,consent,status,identity,funds,prepareActivation,activate,activationConsent,activationSummary});
}
