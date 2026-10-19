// Owner-authenticated controls, distinct from a local draft and from the main
// wallet. Loading or saving settings never activates the financial worker.
export function setupPerpsControlPanel({panel,fields,client,validateSettings,language,doc}={}){
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const value=doc.createElement(tag);if(text)value.textContent=text;return value;};
 const section=node('section');section.className='card';section.append(node('h3',t('Servidor de automatización 24/7','24/7 automation server')));
 const status=node('p',t('Conecta tu sesión de JamdDmaj para consultar la billetera exclusiva y sus límites. No se usa tu saldo principal como capital del bot.','Connect your JamdDmaj session to read the exclusive wallet and its limits. Your main wallet balance is not treated as bot capital.'));status.setAttribute('role','status');
 const identity=node('p'),connect=node('button',t('Consultar servidor','Read server settings')),save=node('button',t('Guardar límites y pausar','Save limits and pause')),pause=node('button',t('Pausar nuevas entradas','Pause new entries'));
 for(const button of [connect,save,pause])button.type='button';let current=null,busy=false;
 const values=()=>Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value]));
 function render(){connect.disabled=busy;save.disabled=busy||current===null;pause.disabled=busy||current===null;}
 function show(value){
  current=value;
  identity.textContent=value?t('Billetera exclusiva: ','Exclusive wallet: ')+value.walletAddress:'';
  status.textContent=value?(value.enabled&&!value.paused?t('El servidor informa automatización activa. Puedes pausarla aquí.','The server reports active automation. You can pause it here.'):t('Automatización desactivada o pausada en el servidor. Guardar límites no la activa.','Automation is inactive or paused on the server. Saving limits does not activate it.')):t('Tu cuenta aún no tiene una billetera exclusiva aprovisionada. No deposites en una dirección de prueba.','Your account does not yet have a provisioned exclusive wallet. Do not deposit into a test address.');
 }
 function error(failure,action){
  if(failure?.code==='invalid-settings'){
   status.textContent=t('Revisa capital, margen, apalancamiento, SL/TP y límites antes de guardar. No se enviaron cambios.','Check capital, margin, leverage, SL/TP and limits before saving. No changes were sent.');return;
  }
  current=null;identity.textContent='';
  status.textContent=failure?.code==='login-required'||failure?.code==='session-changed'?t('Inicia sesión de nuevo con Google en JamdDmaj. No necesitas introducir claves de tu billetera.','Sign in again with Google in JamdDmaj. No wallet keys are needed.'):
   failure?.code==='settings-changed'?t('La configuración cambió en el servidor. Consúltala de nuevo antes de guardar.','Server settings changed. Read them again before saving.'):
   action==='pause'?t('No se confirmó la pausa. No supongas que el bot se detuvo; consulta de nuevo el servidor.','Pause was not confirmed. Do not assume the bot stopped; check the server again.'):
   t('No se pudo confirmar la conexión segura o guardar cambios en el servidor. Tu borrador local no activa el bot.','Could not verify the secure connection or save changes on the server. A local draft does not activate the bot.');
 }
 async function run(action,operation){if(busy)return;busy=true;render();try{await operation();}catch(failure){error(failure,action);}finally{busy=false;render();}}
 connect.onclick=()=>run('read',async()=>{
  const before=JSON.stringify(values()),value=await client.read();show(value);
  // An in-flight refresh must not overwrite edits typed while it was loading.
  if(value&&before===JSON.stringify(values()))for(const [key,input]of Object.entries(fields))input.value=value.settings[key]??'';
 });
 save.onclick=()=>run('save',async()=>{
  if(!current)throw Error();let settings;try{settings=validateSettings(values());}catch{throw Object.assign(Error(),{code:'invalid-settings'});}
  show(await client.save({walletAddress:current.walletAddress,expectedRevision:current.revision,settings}));
 });
 pause.onclick=()=>run('pause',async()=>{if(!current)throw Error();show(await client.pause({walletAddress:current.walletAddress}));});
 section.append(connect,save,pause,identity,status);panel.append(section);render();
 return Object.freeze({section,connect,save,pause,status,identity});
}
