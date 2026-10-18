import {bindWalletDisplay} from './wallet-display.js';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {perpsNavigationDraft} from './perps-navigation.js';
const TOKENS = {
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 }
};
export function exactSwapUnits(value, decimals) {
  if (!/^\d+(\.\d+)?$/.test(value) || value.length > 40) throw new Error('amount');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('precision');
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
  if (units < 1n || units > (1n << 64n) - 1n) throw new Error('range');
  return units.toString();
}
export function setupSwapQuote(parent, language, doc = document) {
  const t = (es, en) => language === 'es' ? es : en;
  const node = (tag, text) => { const el = doc.createElement(tag); if (text) el.textContent = text; return el; };
  const card = node('section'); card.className = 'card';
  const heading=node('h2',t('Comprar SOL','Buy SOL'));
  card.className+=' finance-inline-buy';
  card.append(heading,
    node('p', t('Consulta inicial SOL/USDC. Solo cotización orientativa: no incluye una garantía de precio ni habilita compras. Tus fondos no se mueven.', 'Initial SOL/USDC lookup. Indicative quote only: no guaranteed price or buying enabled. Your funds do not move.')));
  const direction = node('select');
  for (const value of ['SOL', 'USDC']) { const option = node('option', value === 'SOL' ? 'SOL → USDC' : 'USDC → SOL'); option.value = value; direction.append(option); }
  direction.value = 'USDC'; direction.id = 'swap-direction';
  const directionLabel = node('label', t('Entregas → recibes', 'Pay → receive')); directionLabel.htmlFor = direction.id;
  const amount = node('input'); amount.id = 'swap-amount'; amount.inputMode = 'decimal'; amount.autocomplete = 'off';
  const amountLabel = node('label', t('Cantidad que entregas', 'Amount you pay')); amountLabel.htmlFor = amount.id;
  const button = node('button', t('Consultar cotización', 'Get quote'));button.id='swap-quote-button'; button.type = 'button';
  const status = node('p');status.id='swap-status'; status.setAttribute('role', 'status');
  const balance=node('p',t('Saldo disponible · USDC: — (billetera sin consultar)','Available balance · USDC: — (wallet not checked)'));
  const slider=node('input');slider.type='range';slider.min='0';slider.max='100';slider.value='0';slider.disabled=true;slider.setAttribute('aria-label',t('Porcentaje del saldo disponible','Percentage of available balance'));
  const sizing=node('div');sizing.className='trade-size-presets';
  for(const percent of [25,50,75,100]){const b=node('button',percent+'%');b.type='button';b.onclick=()=>{if(slider.disabled){status.textContent=t('Actualiza el saldo en Activos antes de elegir un porcentaje.','Refresh your balance in Assets before choosing a percentage.');return;}slider.value=String(percent);slider.oninput?.();};sizing.append(b);}
  card.append(balance,directionLabel, direction, amountLabel, amount,slider,sizing, button, status); parent.append(card);
  const reviewNative=node('button',t('Continuar en intercambio seguro','Continue to secure swap'));reviewNative.type='button';
  reviewNative.onclick=()=>{
    if(!supported||selectedWalletAccount(doc)?.source!=='native'){status.textContent=t('Selecciona tu billetera JamdDmaj en Activos. Esta entrada abre el swap nativo SOL/USDC; no opera otra billetera.','Select your JamdDmaj wallet in Assets. This entry opens native SOL/USDC swap; it cannot trade another wallet.');return;}
    const Type=doc.defaultView?.Event||globalThis.Event;if(Type)doc.dispatchEvent?.(new Type('jamd-wallet-open-swap'));
    status.textContent=t('Revisa tokens e importe en la pantalla segura. Esta acción no firma ni envía dinero.','Review tokens and amount on the secure screen. This action does not sign or send funds.');
  };card.append(reviewNative);
  let supported=true;
  bindWalletDisplay(doc,language,balance,slider,amount,()=>supported&&direction.value==='USDC');
  let revision = 0, timer;
  function clear() { revision++; clearTimeout(timer); status.textContent = ''; button.disabled = !supported; }
  amount.addEventListener('input', clear); direction.addEventListener('change', ()=>{
    clear();amount.value='';slider.value='0';slider.disabled=true;
    heading.textContent=direction.value==='SOL'?t('Vender SOL','Sell SOL'):t('Comprar SOL','Buy SOL');
    button.textContent=direction.value==='SOL'?t('Cotizar venta de SOL','Quote sale of SOL'):t('Cotizar compra de SOL','Quote purchase of SOL');
    amountLabel.textContent=direction.value==='SOL'?t('Cantidad en SOL','Amount in SOL'):t('Importe en USDC (no USD bancarios)','Amount in USDC (not bank USD)');
    status.textContent=direction.value==='SOL'?t('Introduce SOL manualmente. El porcentaje de USDC no se aplica a SOL.','Enter SOL manually. USDC percentage sizing does not apply to SOL.'):t('Actualiza el saldo en Activos para usar el porcentaje de USDC.','Refresh Assets balance to use USDC percentage sizing.');
  });
  button.onclick = async () => {
    if(!supported)return;
    clear(); const ticket = revision;
    const input = TOKENS[direction.value], output = TOKENS[direction.value === 'SOL' ? 'USDC' : 'SOL'];
    let units;
    try { units = exactSwapUnits(amount.value.trim(), input.decimals); }
    catch { status.textContent = t('Introduce una cantidad válida, sin redondear decimales.', 'Enter a valid amount without rounding decimals.'); return; }
    button.disabled = true; status.textContent = t('Consultando…', 'Loading…');
    try {
      const base = globalThis.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : '';
      const response = await fetch(base + '/api/swap-quote?' + new URLSearchParams({ inputMint: input.mint, outputMint: output.mint, amount: units }), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('unavailable');
      const { quote } = await response.json();
      if (ticket !== revision) return;
      if (quote?.executable !== false || quote.inputMint !== input.mint || quote.outputMint !== output.mint || quote.inAmount !== units || !/^[1-9]\d{0,19}$/.test(quote.outAmount) || !Number.isFinite(quote.expiresAt) || quote.expiresAt <= Date.now() || quote.expiresAt > Date.now() + 15000) throw new Error('invalid');
      const digits = quote.outAmount.padStart(output.decimals + 1, '0');
      const displayed = digits.slice(0, -output.decimals) + '.' + digits.slice(-output.decimals);
      status.textContent = t('Salida estimada: ', 'Estimated output: ') + displayed + (direction.value === 'SOL' ? ' USDC' : ' SOL') + t(' · No es una orden.', ' · Not an order.');
      timer = setTimeout(() => { if (ticket === revision) status.textContent = t('Cotización vencida. Consulta de nuevo.', 'Quote expired. Request again.'); }, quote.expiresAt - Date.now());
    } catch { if (ticket === revision) status.textContent = t('Cotización no disponible. No se ha enviado ninguna operación.', 'Quote unavailable. No transaction was submitted.'); }
    finally { if (ticket === revision) button.disabled = !supported; }
  };
  return {card,selectAsset(asset){
    clear();const symbol=String(asset.symbol||'');heading.textContent=t('Comprar ','Buy ')+symbol;
    supported=symbol==='SOL';reviewNative.disabled=!supported;direction.value='USDC';direction.disabled=!supported;direction.hidden=directionLabel.hidden=!supported;amount.value='';slider.value='0';slider.disabled=true;button.disabled=!supported;
    amountLabel.textContent=t('Importe en USDC (no USD bancarios)','Amount in USDC (not bank USD)');
    button.textContent=t('Cotizar compra de ','Quote purchase of ')+symbol;
    status.textContent=supported?t('La cotización no envía una compra. Firma de billetera pendiente.','A quote does not submit a purchase. Wallet signing pending.'):t('Este activo no está integrado para swaps en Solana. BTC nativo no es un token de Solana; no se sustituirá por otro token sin identificar su red y contrato.','This asset is not integrated for Solana swaps. Native BTC is not a Solana token; no substitute token is used without identifying its network and mint.');
  }};
}

// Ticket presentation only: deliberately no signing or legacy exchange calls.
export function futuresDraftSummary(margin,leverage){
 const m=Number(margin),l=Number(leverage);
 if(!Number.isFinite(m)||m<=0||!Number.isFinite(l)||l<1.1||l>50||!Number.isFinite(m*l))return null;
 return {margin:m,leverage:l,notional:m*l};
}
export function setupFuturesTicket(parent,language,doc,onMarketSelect=()=>{}){
 let selectedAsset='BTC';
 const t=(es,en)=>language==='es'?es:en,node=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const card=node('section');card.className='card finance-futures-order';const title=node('h2','BTC · '+t('Futuros','Futures'));
 const picker=node('details');picker.className='futures-market-picker';const toggle=node('summary');toggle.append(title);picker.append(toggle);
 const search=node('input');search.type='search';search.placeholder=t('Buscar mercado…','Search market…');search.setAttribute('aria-label',search.placeholder);picker.append(search);
 const markets=[{symbol:'BTC',id:'bitcoin'},{symbol:'ETH',id:'ethereum'},{symbol:'SOL',id:'solana'}];
 const choices=node('div');picker.append(choices);
 function filterMarkets(){choices.replaceChildren();for(const asset of markets.filter(asset=>(asset.symbol+' '+asset.id).toLowerCase().includes(search.value.toLowerCase().trim()))){const button=node('button',asset.symbol+' / USDC');button.type='button';button.onclick=()=>{picker.open=false;onMarketSelect(asset);};choices.append(button);}}
 search.value='';search.addEventListener('input',filterMarkets);filterMarkets();
 picker.append(node('small',t('Mercados compatibles con Jupiter Perps: BTC, ETH y SOL.','Jupiter Perps supported markets: BTC, ETH and SOL.')));
 const walletBalance=node('p');card.append(picker,walletBalance,node('small',t('Saldo consultado, antes de reservas y comisiones.','Observed balance, before reserves and fees.')));
 const fields={},ranges={};for(const[key,label,value,min,max]of [['margin',t('Margen USDC','Margin USDC'),'10','10',null],['leverage',t('Apalancamiento','Leverage'),'3','1.1','50']]){
 const l=node('label',label),input=node('input');input.type='number';input.value=value;input.min=min;input.step='0.1';if(max)input.max=max;input.id='jupiter-ticket-'+key;l.htmlFor=input.id;fields[key]=input;card.append(l,input);
 const rangeLabel=node('label',key==='leverage'?t('Apalancamiento · 3×','Leverage · 3×'):t('Margen · % de USDC en billetera','Margin · % of wallet USDC'));
 const range=node('input');range.type='range';range.id='jupiter-range-'+key;rangeLabel.htmlFor=range.id;range.className='finance-slider';range.min=key==='margin'?'0':min;range.max=key==='margin'?'100':max;range.step=key==='margin'?'1':'0.1';range.value=key==='margin'?'0':value;range.setAttribute('aria-label',label);card.append(rangeLabel,range);
 ranges[key]=range;
 if(key==='leverage'){range.oninput=()=>{input.value=range.value;rangeLabel.textContent=t('Apalancamiento · ','Leverage · ')+range.value+'×';};input.oninput=()=>{range.value=input.value;rangeLabel.textContent=t('Apalancamiento · ','Leverage · ')+input.value+'×';};}
 else bindWalletDisplay(doc,language,walletBalance,range,input);
 }
 const preview=node('div');preview.className='trade-order-summary';preview.setAttribute('aria-live','polite');
 const update=()=>{const draft=futuresDraftSummary(fields.margin.value,fields.leverage.value);preview.textContent=draft?t('Exposición indicativa: ','Indicative exposure: ')+draft.notional.toLocaleString(language,{maximumFractionDigits:2})+' USDC · '+t('Margen: ','Margin: ')+draft.margin.toLocaleString(language,{maximumFractionDigits:6})+' USDC · '+draft.leverage+'×':t('Revisa margen y apalancamiento.','Check margin and leverage.');};
 for(const field of Object.values(fields))field.addEventListener?.('input',update);
 for(const range of Object.values(ranges))range.addEventListener?.('input',update);
 card.append(preview);update();
 const priceLabel=node('label',t('Precio de referencia USD · límite para revisar','Reference price USD · review limit'));
 const price=node('input');price.type='number';price.step='0.000001';price.min='0.000001';price.id='jupiter-reference-price';priceLabel.htmlFor=price.id;card.append(priceLabel,price);
 const exitFields={};const exits=node('details');exits.append(node('summary',t('TP / SL · precios opcionales','TP / SL · optional prices')));for(const [key,name]of [['stopLoss','SL'],['takeProfit','TP']]){const input=node('input');input.type='number';input.step='0.000001';input.placeholder=name+' USD';input.setAttribute('aria-label',name+' USD');exitFields[key]=input;exits.append(input);}card.append(exits);
 const native=doc.defaultView?.Capacitor?.isNativePlatform?.()&&doc.defaultView?.Capacitor?.getPlatform?.()==='android'&&doc.defaultView?.Capacitor?.isPluginAvailable?.('NativeWallet');
 const status=node('p');status.setAttribute('role','status');
 const actions=node('div'),buttons=[];actions.className='actions';for(const[side,label,cls]of [['LONG',t('Abrir Long','Open Long'),'buy'],['SHORT',t('Abrir Short','Open Short'),'sell']]){
  const button=node('button',label);button.type='button';button.className=cls;button.disabled=!native;buttons.push(button);
  button.onclick=()=>{
   if(!native||selectedWalletAccount(doc)?.source!=='native'){status.textContent=t('Selecciona tu billetera JamdDmaj en Activos. Phantom no se firma desde esta entrada.','Select your JamdDmaj wallet in Assets. This entry cannot sign with Phantom.');return;}
   try{
    const draft=perpsNavigationDraft({asset:selectedAsset,side,margin:fields.margin.value.trim(),leverage:fields.leverage.value.trim(),referencePrice:price.value.trim(),stopLoss:exitFields.stopLoss.value.trim(),takeProfit:exitFields.takeProfit.value.trim()});
    const EventType=doc.defaultView?.CustomEvent||globalThis.CustomEvent;if(!EventType)throw Error('navigation');
    doc.dispatchEvent(new EventType('jamd-wallet-open-perps',{detail:draft}));
    status.textContent=t('Revisa la orden en la pantalla segura y confirma con huella solo si aceptas. Abrirla no firma ni envía.','Review the order on the secure screen and confirm with biometrics only if you accept. Opening it does not sign or send.');
   }catch{status.textContent=t('Revisa margen mínimo 10 USDC, apalancamiento, precio y TP/SL. No se envió ninguna orden.','Check minimum 10 USDC margin, leverage, price and TP/SL. No order was sent.');}
  };actions.append(button);
 }
 card.append(actions,status,node('p',native?t('La orden se vuelve a validar en Android. Requiere saldo USDC y SOL para comisiones.','The order is revalidated in Android. USDC funding and SOL for fees are required.'):t('Para operar necesitas la versión Android compatible. Esta página no firma ni envía órdenes.','Trading requires a compatible Android build. This page does not sign or submit orders.')));parent.append(card);
 return {selectAsset(asset){selectedAsset=String(asset.symbol||'');title.textContent=selectedAsset+' · '+t('Futuros','Futures');price.value='';for(const input of Object.values(exitFields))input.value='';for(const button of buttons)button.disabled=!native||!markets.some(m=>m.symbol===selectedAsset);status.textContent='';}};
}
