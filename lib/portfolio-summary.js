// Consolidated total for the Assets screen: every linked public wallet plus the
// collateral committed to open futures positions. Read-only: no signing, no
// session creation, no writes. Missing data is shown as unavailable, never zero.
import {walletAccounts} from './wallet-portfolio-store.js'
import {createBotManualPerpsClient} from './bot-manual-perps-client.js'
import {sumUsd, perpsCollateralUsd, combinedTotal, splitUsd} from './portfolio-total.js'

const CARD_ID = 'portfolio-total-card'
const REFRESH_MS = 60000
const WALLET_TIMEOUT_MS = 15000

export function setupPortfolioSummary(language, doc = document, win = window, {client} = {}) {
  const host = doc.getElementById('terminal-assets')
  if (!host || doc.getElementById(CARD_ID)) return () => {}
  const t = (es, en) => (language === 'es' ? es : en)
  const node = (tag, text) => {
    const value = doc.createElement(tag)
    if (text) value.textContent = text
    return value
  }
  const css = `
.pt-card{margin-bottom:16px}
.pt-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.pt-head h2{margin:0}
.pt-refresh{flex:0 0 auto}
.pt-total{font-size:34px;font-weight:600;line-height:1.15;margin:14px 0 4px;letter-spacing:-.5px}
.pt-total small{font-size:15px;font-weight:400;opacity:.75;margin-left:4px}
.pt-note{margin:0 0 14px;font-size:12px}
.pt-rows{list-style:none;margin:0;padding:0;display:grid;gap:1px;border-radius:10px;overflow:hidden}
.pt-rows li{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:11px 12px;background:#0d1626}
.pt-rows li span:first-child{color:#9badc5;overflow-wrap:anywhere}
.pt-rows li strong{font-variant-numeric:tabular-nums;white-space:nowrap}
.pt-sub{color:#dbe7f6!important}
.pt-total-row{background:#16303a!important;border-top:1px solid #2b4a58}
.pt-total-row strong{color:#65e4cf;font-size:17px}
.pt-missing{color:#ffc17e!important;font-size:12px}
.pt-empty{color:#9badc5}
[data-finance-theme=light] .pt-rows li{background:#f3faf8;color:#15213a}
[data-finance-theme=light] .pt-total-row{background:#dff1ec!important}
@media(max-width:560px){.pt-total{font-size:28px}.pt-rows li{flex-wrap:wrap;gap:4px}}
`
  const style = doc.createElement('style')
  style.id = CARD_ID + '-style'
  style.textContent = css
  if (!doc.getElementById(style.id)) doc.head.append(style)

  const card = node('section')
  card.id = CARD_ID
  card.className = 'card account-overview pt-card'
  const head = node('div'); head.className = 'pt-head'
  head.append(node('h2', t('Total de tu dinero', 'Your total money')))
  const refresh = node('button', t('Actualizar', 'Refresh'))
  refresh.type = 'button'; refresh.className = 'pt-refresh'
  head.append(refresh)
  const total = node('div'); total.className = 'pt-total'; total.setAttribute('aria-live', 'polite')
  total.textContent = '—'
  const note = node('p'); note.className = 'pt-note'
  const rows = node('ul'); rows.className = 'pt-rows'
  card.append(head, total, note, rows)

  const state = { disposed: false, busy: false, wallets: [], futures: null, updatedAt: 0 }
  const money = (value) => {
    const split = splitUsd(value)
    if (!split) return '—'
    return '≈ ' + new Intl.NumberFormat(language, {style: 'currency', currency: 'USD', maximumFractionDigits: 2}).format(value)
  }
  const short = (address) => (address ? address.slice(0, 4) + '…' + address.slice(-4) : '')

  function futRow() {
    if (!state.futures) return t('Futuros · sin leer', 'Futures · not read')
    if (state.futures.state === 'ok') {
      const label = state.futures.count === 1 ? t('1 posición', '1 position') : t(`${state.futures.count} posiciones`, `${state.futures.count} positions`)
      return money(state.futures.collateralUsd) + ' · ' + label
    }
    if (state.futures.state === 'no-session') return t('Inicia sesión para consultarlos', 'Sign in to read them')
    if (state.futures.state === 'no-wallet') return t('Vincula la billetera del bot', 'Link the bot wallet')
    return t('No disponible ahora', 'Unavailable right now')
  }

  function render() {
    rows.replaceChildren()
    const walletValues = state.wallets.map((wallet) => (wallet.ok ? wallet.valueUsd : null))
    const wallets = sumUsd(walletValues)
    const combined = combinedTotal(wallets, state.futures?.state === 'ok' ? state.futures : null)
    total.textContent = combined.totalUsd === null ? '—' : money(combined.totalUsd)
    if (!state.wallets.length) {
      note.textContent = t('Vincula una billetera en Activos para ver el total.', 'Link a wallet in Assets to see the total.')
    } else if (combined.totalUsd === null) {
      note.textContent = t('Falta leer una parte; no se muestra un total parcial como si fuera el total.', 'Part of the reading is missing; a partial figure is not shown as the total.')
    } else {
      const lines = [t('Suma estimada de tus billeteras y del colateral en futuros. No es saldo bancario.', 'Estimated sum of your wallets and futures collateral. Not a bank balance.')]
      if (!combined.complete) lines.push(t('Es un total parcial: alguna billetera no respondió.', 'This total is partial: a wallet did not respond.'))
      if (state.futures?.state === 'ok') lines.push(t('El colateral no incluye ganancia o pérdida abierta.', 'Collateral does not include open profit or loss.'))
      note.textContent = lines.join(' ')
    }
    for (const wallet of state.wallets) {
      const row = node('li')
      row.append(node('span', wallet.name + ' · ' + short(wallet.address)))
      const value = node('strong', wallet.ok ? money(wallet.valueUsd) : t('No disponible', 'Unavailable'))
      if (!wallet.ok) value.className = 'pt-missing'
      row.append(value)
      rows.append(row)
    }
    const futuresRow = node('li')
    futuresRow.append(node('span', t('Futuros · colateral abierto', 'Futures · open collateral')))
    const futuresValue = node('strong', futRow())
    if (state.futures?.state !== 'ok') futuresValue.className = 'pt-missing'
    futuresRow.append(futuresValue)
    rows.append(futuresRow)
    const totalRow = node('li'); totalRow.className = 'pt-total-row'
    totalRow.append(node('span', combined.complete || !state.wallets.length ? t('Total estimado', 'Estimated total') : t('Total estimado · parcial', 'Estimated total · partial')))
    totalRow.append(node('strong', combined.totalUsd === null ? '—' : money(combined.totalUsd)))
    rows.append(totalRow)
    refresh.disabled = state.busy
    refresh.textContent = state.busy ? t('Leyendo…', 'Reading…') : t('Actualizar', 'Refresh')
  }

  async function readWallet(address) {
    const base = win.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : ''
    const response = await win.fetch(base + '/api/solana-portfolio?address=' + encodeURIComponent(address), {
      cache: 'no-store',
      signal: AbortSignal.timeout(WALLET_TIMEOUT_MS),
    })
    const data = await response.json()
    const value = Number(data?.estimatedValueUsd)
    if (!response.ok || data?.ok !== true || data?.address !== address || data?.network !== 'solana:mainnet' || !Number.isFinite(value) || value < 0) {
      throw new Error('invalid-portfolio')
    }
    return value
  }

  async function readFutures() {
    const watch = walletAccounts(doc).filter((account) => account.source === 'watch')
    if (!watch.length) return {state: 'no-wallet'}
    const perps = client || createBotManualPerpsClient({fetchImpl: win.fetch?.bind(win) ?? globalThis.fetch})
    let lastError = null
    for (const account of watch) {
      try {
        const data = await perps.positions(account.address)
        return {state: 'ok', ...perpsCollateralUsd(data?.positions)}
      } catch (error) {
        lastError = error
      }
    }
    return {state: lastError?.code === 'session-missing' ? 'no-session' : 'error'}
  }

  async function refreshAll() {
    if (state.busy || state.disposed) return
    state.busy = true
    render()
    const accounts = walletAccounts(doc)
    try {
      const results = await Promise.all(accounts.map(async (account) => {
        try {
          return {name: account.name, address: account.address, ok: true, valueUsd: await readWallet(account.address)}
        } catch {
          return {name: account.name, address: account.address, ok: false, valueUsd: null}
        }
      }))
      if (state.disposed) return
      state.wallets = results
      state.futures = await readFutures()
      state.updatedAt = Date.now()
    } finally {
      state.busy = false
      if (!state.disposed) render()
    }
  }

  let timer = null
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => { void refreshAll() }, 1500)
    timer?.unref?.()
  }
  refresh.onclick = () => { void refreshAll() }
  doc.addEventListener?.('jamd-wallet-portfolio', schedule)
  doc.addEventListener?.('jamd-wallet-refresh', schedule)
  host.prepend(card)
  void refreshAll()
  const interval = setInterval(() => { if (!doc.hidden) void refreshAll() }, REFRESH_MS)
  interval?.unref?.()

  return () => {
    state.disposed = true
    clearTimeout(timer)
    clearInterval(interval)
    doc.removeEventListener?.('jamd-wallet-portfolio', schedule)
    doc.removeEventListener?.('jamd-wallet-refresh', schedule)
    style.remove()
    card.remove()
  }
}
