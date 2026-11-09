// Phoenix entry ticket: review then explicit confirmation, never a retry.
// While the release gate is set the server answers phoenix-entry-gated and this
// panel shows that plainly instead of pretending the market is operable.
import {selectedWalletAccount} from './wallet-portfolio-store.js'
import {createPhoenixManualClient} from './phoenix-manual-client.js'

const usdUnits = (text) => {
  const match = /^\d{1,9}(\.\d{1,6})?$/.exec(String(text).trim())
  if (!match) return null
  const [whole, fraction = ''] = match[0].split('.')
  return whole + fraction.padEnd(6, '0')
}

export function setupPhoenixEntryTicket(parent, language, doc = document, {markets = [], client} = {}) {
  if (!parent || !Array.isArray(markets) || !markets.length) return () => {}
  const t = (es, en) => (language === 'es' ? es : en)
  const node = (tag, text) => {
    const value = doc.createElement(tag)
    if (text) value.textContent = text
    return value
  }
  const panel = node('details')
  panel.id = 'phoenix-entry-ticket'
  panel.className = 'card phoenix-entry'
  panel.append(node('summary', t('Abrir posición · Phoenix', 'Open position · Phoenix')));panel.open=true
  panel.append(node('p', t(
    'Revisión y confirmación separadas. La apertura solo se ejecuta si el servidor tiene el venue habilitado; si está bloqueada, lo dirá y no enviará nada.',
    'Separate review and confirmation. Opening only runs when the server has the venue enabled; when blocked it says so and sends nothing.',
  )))
  // Searchable market picker: typing filters the markets the venue really
  // serves, and picking one sets the symbol used by the review.
  let selectedMarket = markets[0].symbol
  const search = node('input'); search.type = 'search'; search.id = 'phoenix-entry-search'
  search.placeholder = t('Buscar mercado… (BTC, DOGE, SOL…)', 'Search market… (BTC, DOGE, SOL…)')
  search.setAttribute('aria-label', t('Buscar mercado', 'Search market'))
  const results = node('div'); results.className = 'phoenix-market-results'; results.setAttribute('role', 'listbox')
  const renderResults = (query = '') => {
    const needle = query.trim().toUpperCase()
    results.replaceChildren()
    if (!needle) return
    const matches = markets.filter((entry) => entry.symbol.toUpperCase().includes(needle)).slice(0, 8)
    for (const entry of matches) {
      const option = node('button', entry.symbol)
      option.type = 'button'; option.className = 'phoenix-market-option'
      option.onclick = () => { selectedMarket = entry.symbol; search.value = entry.symbol; results.replaceChildren() }
      results.append(option)
    }
    if (!matches.length) results.append(node('p', t('Ese token no tiene mercado en Phoenix.', 'That token has no Phoenix market.')))
  }
  search.oninput = () => renderResults(search.value)
  renderResults()
  const side = node('select'); side.id = 'phoenix-entry-side'
  for (const [value, label] of [['LONG', t('Long', 'Long')], ['SHORT', t('Short', 'Short')]]) {
    const option = node('option', label); option.value = value; side.append(option)
  }
  const margin = node('input'); margin.type = 'number'; margin.min = '10'; margin.step = '0.01'; margin.value = '10'; margin.id = 'phoenix-entry-margin'
  margin.setAttribute('aria-label', t('Margen en USDC (mínimo 10)', 'Margin in USDC (minimum 10)'))
  const leverage = node('input'); leverage.type = 'number'; leverage.min = '1.1'; leverage.max = '50'; leverage.step = '0.1'; leverage.value = '3'; leverage.id = 'phoenix-entry-leverage'
  leverage.setAttribute('aria-label', t('Apalancamiento', 'Leverage'))
  const review = node('button', t('Revisar entrada', 'Review entry')); review.type = 'button'
  const prepare = node('button', t('Preparar cuenta para este mercado', 'Prepare account for this market')); prepare.type = 'button'; prepare.hidden = true
  const status = node('p'); status.setAttribute('role', 'status')
  const details = node('div')
  const consent = node('input'); consent.type = 'checkbox'
  const consentLabel = node('label')
  consentLabel.append(consent, node('span', t(' Revisé el precio límite, el margen, la comisión de plataforma y los costes de red. Autorizo esta apertura.', ' I reviewed the price limit, margin, platform fee and network costs. I authorize this opening.')))
  const confirm = node('button', t('Confirmar apertura', 'Confirm opening')); confirm.type = 'button'; confirm.disabled = true
  const reviewBox = node('div'); reviewBox.hidden = true
  reviewBox.append(consentLabel, confirm)
  panel.append(
    node('label', t('Mercado', 'Market')), search, results,
    node('label', t('Dirección', 'Side')), side,
    node('label', t('Margen USDC', 'Margin USDC')), margin,
    node('label', t('Apalancamiento ×', 'Leverage ×')), leverage,
    review, prepare, status, details, reviewBox,
  )
  parent.append(panel)

  const perps = client || createPhoenixManualClient({})
  const state = { busy: false, disposed: false, pending: null }
  const wallet = () => {
    const account = selectedWalletAccount(doc)
    return account?.source === 'watch' ? account.address : null
  }
  const render = () => {
    review.disabled = state.busy || state.disposed || !wallet()
    confirm.disabled = state.busy || !state.pending || !consent.checked
  }
  const message = (error) => {
    const code = String(error?.code || error?.message || '')
    if (code.includes('phoenix-entry-gated')) return t('Las entradas de Phoenix están bloqueadas hasta el release del servidor. No se envió nada.', 'Phoenix entries are blocked until the server release. Nothing was sent.')
    if (code.includes('phoenix-unavailable')) return t('Phoenix todavía no está habilitado en el servidor. No se envió nada.', 'Phoenix is not yet enabled on the server. Nothing was sent.')
    if (code.includes('session')) return t('Inicia sesión para operar la billetera del bot.', 'Sign in to trade the bot wallet.')
    if (code.includes('onboarding')) return t('La cuenta necesita el onboarding de Phoenix antes de abrir.', 'The account needs Phoenix onboarding before opening.')
    if (code.includes('insufficient')) return t('No hay USDC suficiente en la billetera del bot.', 'The bot wallet does not have enough USDC.')
    return t('No se pudo revisar la entrada. Código: ', 'The entry could not be reviewed. Code: ') + (code || 'unknown')
  }
  const showReview = (r) => {
    details.replaceChildren()
    const rows = [
      [t('Mercado', 'Market'), r.symbol + ' · ' + r.side],
      [t('Margen', 'Margin'), (Number(r.marginUsdcUnits) / 1e6) + ' USDC'],
      [t('Apalancamiento', 'Leverage'), (Number(r.leverageTenths) / 10) + '×'],
      [t('Precio de referencia', 'Reference price'), r.referencePrice],
      [t('Precio límite', 'Price limit'), r.priceLimitUsd],
      [t('Comisión de plataforma', 'Platform fee'), (Number(r.platformFeeUsdcUnits) / 1e6) + ' USDC'],
      [t('Coste de red máximo', 'Maximum network cost'), (Number(r.maximumNetworkAndRentLamports) / 1e9) + ' SOL'],
      [t('Comisión del protocolo (máx.)', 'Protocol fee (max)'), (Number(r.protocolFeeUsdcUnits) / 1e6) + ' USDC'],
    ]
    for (const [label, value] of rows) {
      const line = node('p')
      line.append(node('strong', label + ': '), node('span', String(value)))
      details.append(line)
    }
    reviewBox.hidden = false
    consent.checked = false
    state.pending = r
    render()
  }
  const run = async (fn) => {
    if (state.busy || state.disposed) return
    state.busy = true
    render()
    try { await fn() } catch (error) { if (!state.disposed) status.textContent = message(error) } finally {
      state.busy = false
      if (!state.disposed) render()
    }
  }

  const draftOf = () => {
    const marginUnits = usdUnits(margin.value)
    const leverageTenths = Math.round(Number(leverage.value) * 10)
    if (!marginUnits || BigInt(marginUnits) < 10000000n) return {error: t('El margen mínimo es 10 USDC.', 'The minimum margin is 10 USDC.')}
    if (!Number.isInteger(leverageTenths) || leverageTenths < 11 || leverageTenths > 500) return {error: t('El apalancamiento debe estar entre 1,1× y 50×.', 'Leverage must be between 1.1× and 50×.')}
    return {draft: {symbol: selectedMarket, side: side.value || 'LONG', marginUsdcUnits: marginUnits, leverageTenths}}
  }
  review.onclick = () => run(async () => {
    const address = wallet()
    if (!address) return
    const parsed = draftOf()
    if (parsed.error) { status.textContent = parsed.error; return }
    status.textContent = t('Preparando la revisión…', 'Preparing the review…')
    details.replaceChildren(); reviewBox.hidden = true; state.pending = null
    try {
      const r = await perps.prepareEntry(address, parsed.draft)
      if (state.disposed || wallet() !== address) return
      showReview(r)
      status.textContent = t('Revisa la entrada y confirma por separado.', 'Review the entry and confirm separately.')
    } catch (error) {
      if (state.disposed) return
      if (String(error?.code || error?.message || '').includes('onboarding')) {
        prepare.hidden = false
        status.textContent = t('La cuenta necesita una subcuenta aislada para este mercado. Pulsa "Preparar cuenta".', 'The account needs an isolated subaccount for this market. Press "Prepare account".')
        return
      }
      throw error
    }
  })
  prepare.onclick = () => run(async () => {
    const address = wallet()
    if (!address) return
    const parsed = draftOf()
    if (parsed.error) { status.textContent = parsed.error; return }
    status.textContent = t('Preparando la cuenta aislada…', 'Preparing the isolated account…')
    const created = await perps.setupAccount(address, parsed.draft, true)
    let current = created
    for (let attempt = 0; attempt < 30 && !state.disposed; attempt += 1) {
      if (current.state === 'FINALIZED') break
      await new Promise((resolve) => setTimeout(resolve, 2000))
      if (state.disposed || wallet() !== address) return
      status.textContent = t('Cuenta firmada. Confirmando en cadena…', 'Account signed. Confirming on chain…')
      current = await perps.recoverSetup(address, current.id)
    }
    if (state.disposed) return
    if (current.state === 'FINALIZED') {
      prepare.hidden = true
      status.textContent = t('Cuenta lista. Pulsa "Revisar entrada" otra vez.', 'Account ready. Press "Review entry" again.')
    } else {
      status.textContent = t('Cuenta preparada, confirmación pendiente. Vuelve a intentarlo en unos segundos.', 'Account prepared, confirmation pending. Try again in a few seconds.')
    }
  })

  confirm.onclick = () => run(async () => {
    const r = state.pending
    if (!r || !consent.checked) return
    state.pending = null
    reviewBox.hidden = true
    status.textContent = t('Apertura enviada a revisión final. Consulta el resultado; no la repitas.', 'Opening submitted for final review. Check the result; do not repeat it.')
    const result = await perps.confirmEntry(r, true)
    if (!state.disposed) status.textContent = t('Estado: ', 'State: ') + (result?.state || 'UNKNOWN') + ' · ' + (result?.phase || '')
  })
  consent.onchange = render
  render()

  return () => {
    state.disposed = true
    panel.remove()
  }
}
