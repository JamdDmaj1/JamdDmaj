import {bindWalletDisplay} from './wallet-display.js';
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
    supported=symbol==='SOL';direction.value='USDC';direction.disabled=!supported;direction.hidden=directionLabel.hidden=!supported;amount.value='';slider.value='0';slider.disabled=true;button.disabled=!supported;
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
 const exits=node('details');exits.append(node('summary',t('TP / SL · opcional','TP / SL · optional')));for(const name of ['SL','TP']){const input=node('input');input.type='number';input.placeholder=name+' %';input.setAttribute('aria-label',name+' %');exits.append(input);}card.append(exits);
 const actions=node('div');actions.className='actions';for(const[side,label,cls]of [['LONG',t('Abrir Long','Open Long'),'buy'],['SHORT',t('Abrir Short','Open Short'),'sell']]){const button=node('button',label);button.type='button';button.className=cls;button.disabled=true;button.title=t('Ejecución Jupiter pendiente','Jupiter execution pending');actions.append(button);}card.append(actions,node('p',t('Ejecución Jupiter pendiente de integrar. No se usa Bitget ni se envían órdenes desde este formulario.','Jupiter execution integration pending. This form does not use Bitget or submit orders.')));parent.append(card);
 return {selectAsset(asset){title.textContent=asset.symbol+' · '+t('Futuros','Futures');}};
}
