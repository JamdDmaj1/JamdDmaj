import {createTokenHistoryReader,summarizeTokenHistory} from './wallet-token-history.js';
export function createTokenHistoryPanel(wallet,mint,language,doc,win){
 const es=language==='es',node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;},element=node('section');
 element.className='wallet-token-history';
 const title=node('h4',es?'Tu actividad con este token':'Your activity with this token'),scope=node('p',`${es?'Billetera':'Wallet'}: ${wallet}`);scope.style.overflowWrap='anywhere';
 const summary=node('p'),list=node('div'),status=node('p'),load=node('button',es?'Consultar operaciones recientes':'Load recent operations');load.type='button';status.setAttribute('role','status');
 const disclaimer=node('p',es?'Historial parcial de transacciones finalizadas que mencionan esta billetera. Compras/ventas y promedio solo para swaps simples de Jupiter contra USDC detectados en las páginas cargadas. Otras monedas, transferencias y operaciones ambiguas no tienen precio de compra inferido. No es coste fiscal ni beneficio realizado.':'Partial finalized transaction history referencing this wallet. Buy/sell counts and average cover only simple Jupiter/USDC swaps found in loaded pages. Other currencies, transfers and ambiguous operations have no inferred purchase price. Not tax cost basis or realized profit.');disclaimer.style.fontSize='12px';
 element.append(title,scope,summary,load,status,list,disclaimer);
 const read=createTokenHistoryReader(win.fetch.bind(win));let controller=null,disposed=false,before=null,entries=[],scanned=0,missing=0;
 const n=v=>v===null?'—':v.toLocaleString(language,{maximumSignificantDigits:8});
 load.onclick=async()=>{
  if(controller||disposed)return;controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),25000);load.disabled=true;status.textContent=es?'Consultando Solana…':'Reading Solana…';
  try{const data=await read(wallet,mint,before,controller.signal);if(disposed)return;
   if(data.wallet!==wallet||data.mint!==mint)throw Error();before=data.before;entries=[...new Map([...entries,...data.entries].map(e=>[e.signature,e])).values()].sort((a,b)=>b.at-a.at);scanned+=data.scanned;missing+=data.unavailable;
   const s=summarizeTokenHistory(entries);summary.textContent=es?`En páginas cargadas: ${s.buys} compras · ${s.sells} ventas · Pagado: ${n(s.spentUsdc)} USDC · Precio medio de compras: ${n(s.averageUsdc)} USDC/token`:`Loaded pages: ${s.buys} buys · ${s.sells} sells · Paid: ${n(s.spentUsdc)} USDC · Average buy price: ${n(s.averageUsdc)} USDC/token`;
   list.replaceChildren();for(const e of entries){const row=node('article');row.style.cssText='padding:12px;margin:8px 0;border:1px solid #293e50;border-radius:10px';const label=({buy:es?'Compra observada':'Observed buy',sell:es?'Venta observada':'Observed sell',in:es?'Entrada · precio no identificado':'Incoming · price unidentified',out:es?'Salida · precio no identificado':'Outgoing · price unidentified'})[e.kind];row.append(node('strong',label),node('p',new Date(e.at).toLocaleString(language)),node('p',`${es?'Cantidad':'Quantity'}: ${n(e.quantity)} · ${es?'Total':'Total'}: ${n(e.totalUsdc)} USDC · ${es?'Precio por token':'Price per token'}: ${n(e.priceUsdc)} USDC`));const link=node('a',es?'Ver transacción ↗':'View transaction ↗');link.href=`https://solscan.io/tx/${e.signature}`;link.target='_blank';link.rel='noopener noreferrer';row.append(link);list.append(row);}
   status.textContent=`${es?'Transacciones revisadas':'Transactions scanned'}: ${scanned} · ${es?'No recuperadas':'Unavailable'}: ${missing}${entries.length?'':es?' · No se encontraron movimientos en estas páginas.':' · No movements found in these pages.'}`;
   load.textContent=before?(es?'Cargar 10 anteriores':'Load 10 older'):(es?'Fin de las páginas de esta dirección':'End of this address’s pages');load.disabled=!before;
  }catch{if(!disposed){status.textContent=es?'No se pudo consultar el historial. Esto no significa que nunca hayas comprado. Reintenta.':'History lookup failed. This does not mean you have never bought. Retry.';load.disabled=false;}}
  finally{clearTimeout(timer);controller=null;}
 };
 return{element,dispose(){disposed=true;controller?.abort();}};
}
