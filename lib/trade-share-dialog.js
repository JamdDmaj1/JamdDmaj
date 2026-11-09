// Local preview/export only. No upload, financial call, wallet or balance copy.
import {drawTradeShareCard,defaultTradeShareOptions,tradeShareModel} from './trade-share-card.js';
const dialogs=new WeakMap();
export function openTradeShareDialog({doc,language='es',item,sourceButton,isCurrent,onClose=()=>{},restoreFocus=()=>{}}){
 dialogs.get(doc)?.();const t=(es,en)=>language==='es'?es:en,node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const dialog=node('dialog',null,'trade-share-dialog'),options={...defaultTradeShareOptions},initial=tradeShareModel(item,options,language),open=initial.open;
 const top=node('div',null,'bch-header'),title=node('h3',t('Tu operación, a tu manera','Your trade, your way')),close=node('button','×','bch-dismiss');close.type='button';close.setAttribute('aria-label',t('Cerrar','Close'));top.append(title,close);
 const info=node('p',open?t('Captura de una posición abierta, no una ganancia realizada. La imagen no incluye wallet ni saldo.','Snapshot of an open position, not realized profit. Wallet and balance are never included.'):t('Elige qué datos aparecen. La imagen nunca incluye tu wallet ni tu saldo.','Choose what to show. Your wallet and balance are never included.'),'bch-help'),canvas=node('canvas',null,'bch-share-preview');canvas.setAttribute('aria-label',t('Vista previa de la imagen para compartir','Share image preview'));
 const form=node('div',null,'bch-share-options'),notice=node('p',null,'bch-help'),actions=node('div',null,'bch-share-actions');notice.setAttribute('role','status');
 const controls=[];let closed=false,busy=false,revision=0;const urls=new Set(),win=doc.defaultView||globalThis,available=initial.available;
 for(const [key,label]of [['percentage',t('Mostrar porcentaje','Show percentage')],['amount',open?t('Mostrar PnL estimado en USD','Show estimated USD PnL'):t('Mostrar ganancia/pérdida en USDC','Show USDC profit/loss')],['margin',open?t('Mostrar margen observado','Show observed collateral'):t('Mostrar margen aportado','Show contributed margin')],['date',open?t('Mostrar fecha de captura','Show snapshot date'):t('Mostrar fecha de cierre','Show close date')]]){
  const labelNode=node('label'),input=node('input');input.type='checkbox';input.checked=options[key];input.dataset.shareOption=key;
  if(!available&&key!=='date'){input.disabled=true;input.checked=false;options[key]=false;}
  input.onchange=()=>{options[key]=input.checked;paint();};labelNode.append(input,node('span',label));form.append(labelNode);controls.push([input,!input.disabled]);
 }
 for(const [key,label,choices]of [['theme',t('Estilo','Style'),[['dark',t('Oscuro','Dark')],['light',t('Claro','Light')]]],['shape',t('Formato','Format'),[['wide',t('Horizontal','Landscape')],['square',t('Cuadrado','Square')]]]]){
  const labelNode=node('label',label),select=node('select');for(const [value,text]of choices){const option=node('option',text);option.value=value;select.append(option);}select.value=options[key];select.setAttribute('aria-label',label);select.onchange=()=>{options[key]=select.value;paint();};labelNode.append(select);form.append(labelNode);controls.push([select,true]);
 }
 const download=node('button',t('Descargar PNG','Download PNG'),'bch-primary'),share=node('button',t('Compartir imagen','Share image'),'bch-secondary');download.type=share.type='button';share.hidden=typeof win.navigator?.share!=='function';actions.append(download,share);
 dialog.append(top,info,canvas,form,notice,actions);
 // A different entrance each time keeps the action feeling alive.
 try{dialog.classList?.add(['share-in-pop','share-in-slide','share-in-flip','share-in-zoom'][Math.floor(Math.random()*4)]);}catch{}
doc.body.append(dialog);dialog.setAttribute('aria-label',title.textContent);
 function active(){try{return !closed&&isCurrent()===true;}catch{return false;}}
 function ensure(){if(active())return true;if(!closed){notice.textContent=t('La cuenta o la posición cambió, o los datos vencieron. Cierra esta vista y actualiza antes de compartir.','Account/position changed or data expired. Close this preview and refresh before sharing.');download.disabled=share.disabled=true;}return false;}
 function paint(){revision++;try{drawTradeShareCard(canvas,item,options,language);notice.textContent=available?(open?t('Captura fija; el PnL no está realizado y excluye comisiones, financiación y cierre.','Fixed snapshot; unrealized PnL excludes fees, funding and closing costs.'):t('El porcentaje usa el margen aportado. El resultado excluye costes en SOL.','Percentage uses contributed margin. Result excludes SOL costs.')):t('Resultado no disponible: la imagen no mostrará cifras inventadas.','Result unavailable: the image will not show invented figures.');ensure();}catch{notice.textContent=t('No se pudo generar la imagen.','Image could not be generated.');download.disabled=share.disabled=true;}}
 function cleanup(){if(closed)return;closed=true;revision++;win.clearInterval(timer);doc.removeEventListener?.('jamd-wallet-portfolio',changed);doc.removeEventListener?.('jamd-trading-state',changed);for(const url of urls)win.URL.revokeObjectURL(url);urls.clear();dialog.close?.();dialog.remove();if(dialogs.get(doc)===cleanup)dialogs.delete(doc);onClose();if(sourceButton?.isConnected!==false)sourceButton?.focus?.();else restoreFocus();}
 function changed(){if(!active())cleanup();}
 const timer=win.setInterval(()=>ensure(),1000);timer?.unref?.();doc.addEventListener?.('jamd-wallet-portfolio',changed);doc.addEventListener?.('jamd-trading-state',changed);dialogs.set(doc,cleanup);close.onclick=cleanup;dialog.addEventListener('close',cleanup);
 async function png(){const ticket=revision,blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||!ensure()||ticket!==revision)throw Error('PNG_EXPORT_CHANGED');return blob;}
 const filename='JamdDmaj-'+item.asset+'-'+item.side+(open?'-abierta':'')+'.png';
 function save(blob){const url=win.URL.createObjectURL(blob),a=node('a');urls.add(url);a.href=url;a.download=filename;doc.body.append(a);a.click();a.remove();win.setTimeout(()=>{win.URL.revokeObjectURL(url);urls.delete(url);},10000);}
 async function exportImage(useShare){if(busy||!ensure())return;busy=true;for(const [n]of controls)n.disabled=true;download.disabled=share.disabled=true;
  try{const blob=await png();if(!ensure())return;const file=new win.File([blob],filename,{type:'image/png'});
   if(useShare&&typeof win.navigator?.share==='function'&&win.navigator.canShare?.({files:[file]})){await win.navigator.share({files:[file]});if(active())notice.textContent=t('Imagen enviada al menú de compartir.','Image sent to the share menu.');}
   else{save(blob);notice.textContent=t('PNG descargado. Puedes compartirlo donde prefieras.','PNG downloaded. Share it wherever you prefer.');}
  }catch(error){if(active())notice.textContent=error.name==='AbortError'?t('Compartir cancelado.','Sharing cancelled.'):t('No se pudo exportar. Vuelve a intentarlo desde esta vista.','Export failed. Try again from this preview.');}
  finally{busy=false;if(active()){for(const [n,enabled]of controls)n.disabled=!enabled;download.disabled=share.disabled=false;}}
 }
 download.onclick=()=>exportImage(false);share.onclick=()=>exportImage(true);paint();if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');return cleanup;
}
