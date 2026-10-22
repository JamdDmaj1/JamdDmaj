import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {openWebPerpsSigningJournal,createWebPerpsOperationStatusClient} from './perps-web-wallet-session.js';

// Explicit read-only recovery; never connects a provider, signs or resubmits.
export function setupWebPerpsRecovery(parent,language,doc){
 const t=(es,en)=>language==='es'?es:en;
 const panel=doc.createElement('section'),button=doc.createElement('button'),status=doc.createElement('p');
 panel.className='web-perps-recovery';button.type='button';button.textContent=t('Consultar operación pendiente','Check pending operation');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');panel.append(button,status);parent.append(panel);
 let disposed=false,busy=false,revision=0;
 const changed=()=>{revision++;status.textContent='';};
 doc.addEventListener?.('jamd-wallet-portfolio',changed);
 button.onclick=async()=>{
  if(disposed||busy)return;
  const account=selectedWalletAccount(doc);
  if(account?.source!=='external'){status.textContent=t('Selecciona la billetera externa que usaste para esta operación.','Select the external wallet used for this operation.');return;}
  const ticket=revision,address=account.address,current=()=>!disposed&&ticket===revision&&selectedWalletAccount(doc)?.source==='external'&&selectedWalletAccount(doc)?.address===address;
  busy=true;button.disabled=true;let journal;
  status.textContent=t('Consultando el registro. No se pedirá firma ni se reenviará dinero.','Checking the record. No signature or resubmission will be requested.');
  try{
   journal=await openWebPerpsSigningJournal({indexedDB:doc.defaultView?.indexedDB});
   const rows=await journal.pending(address);if(!current())return;
   if(!rows.length){status.textContent=t('No hay operaciones web pendientes en este navegador para esta billetera. Esto no confirma que no tengas posiciones abiertas.','No pending web operations for this wallet in this browser. This does not confirm that you have no open positions.');return;}
   const row=rows[0];
   if(row.state==='SIGNING'){status.textContent=t('La firma anterior quedó sin confirmar. Se conserva el bloqueo; no vuelvas a enviar la orden.','The previous signature remains unconfirmed. The hold is retained; do not resubmit the order.');return;}
   const request=doc.defaultView?.fetch?.bind(doc.defaultView);if(!request)throw Error();
   const client=createWebPerpsOperationStatusClient({journal,fetchImpl:request});
   const proof=await client.inspect(row.operationId);if(!current())return;
   if(!proof){status.textContent=t('El servidor aún no confirma el resultado. La operación sigue retenida y no se ha reenviado.','The server has not confirmed the outcome. The operation remains held and has not been resubmitted.');return;}
   const result=await journal.recordServerSettlement(proof);if(!current())return;
   status.textContent=result.state==='ENTRY_CONFIRMED'?t('Entrada confirmada en el registro del servidor. Se conserva su firma; no se ha reenviado. Consulta las posiciones para conocer su estado actual.','Entry confirmed in the server record. Its signature is retained; nothing was resubmitted. Check positions for its current state.'):
    t('El servidor verificó que la entrada falló. Se conserva su historial y no se ha reenviado.','The server verified that the entry failed. Its history is retained and nothing was resubmitted.');
  }catch{if(current())status.textContent=t('No se pudo verificar el resultado. Se conserva cualquier operación pendiente; no se pidió firma ni se reenviaron fondos.','Could not verify the outcome. Any pending operation is retained; no signature or resubmission was requested.');}
  finally{journal?.close();busy=false;button.disabled=disposed;}
 };
 return {dispose(){disposed=true;revision++;button.disabled=true;doc.removeEventListener?.('jamd-wallet-portfolio',changed);}};
}
