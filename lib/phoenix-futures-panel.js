// Read-only Phoenix futures market directory for the Futures tab. It lists the
// Mercados tokens that actually have a Phoenix market, and says plainly how many
// do not. Execution stays disabled here until the server composition ships:
// this panel never signs, sends or promises trading readiness.
import {createPhoenixPublicClient} from './phoenix-public-client.js'
import {mapMercadosToPhoenix} from './phoenix-market-map.js'
import {MARKETS_CATALOG} from './markets-catalog.js'

export function setupPhoenixFuturesPanel(parent, language, doc = document, {client, now = Date.now} = {}) {
  if (!parent) return () => {}
  const t = (es, en) => (language === 'es' ? es : en)
  const node = (tag, text) => {
    const value = doc.createElement(tag)
    if (text) value.textContent = text
    return value
  }
  const panel = node('details')
  panel.id = 'phoenix-futures-markets'
  panel.className = 'card phoenix-markets'
  panel.append(node('summary', t('Mercados de futuros · Phoenix', 'Futures markets · Phoenix')))
  const intro = node('p', t(
    'Tokens de Mercados con mercado real en Phoenix. La habilitación de entradas y cierres en este venue está en curso; nada de esta lista autoriza una operación.',
    'Markets tokens with a real Phoenix market. Enabling entries and closes on this venue is in progress; nothing in this list authorizes an operation.',
  ))
  const status = node('p')
  status.setAttribute('role', 'status')
  const refresh = node('button', t('Consultar mercados', 'Read markets'))
  refresh.type = 'button'
  const list = node('div')
  list.className = 'phoenix-market-list'
  panel.append(intro, refresh, status, list)
  parent.append(panel)

  let disposed = false
  let busy = false
  const money = (value) => new Intl.NumberFormat(language, {maximumFractionDigits: 2}).format(value)

  const row = (entry, active) => {
    const line = node('div')
    line.className = 'phoenix-market-row'
    line.append(node('strong', entry.symbol))
    const tiers = Array.isArray(entry.market?.tiers) ? entry.market.tiers : []
    const leverage = tiers.reduce((max, tier) => Math.max(max, Number(tier.leverageTenths) || 0), 0) / 10
    const fee = Number(entry.market?.feeMicro)
    const details = []
    if (leverage > 0) details.push(t('hasta ', 'up to ') + money(leverage) + '×')
    if (Number.isFinite(fee)) details.push((fee / 10000).toFixed(2) + '% ' + t('comisión', 'fee'))
    if (!active) details.push(t('mercado inactivo', 'inactive market'))
    line.append(node('span', details.join(' · ')))
    return line
  }

  const render = (mapping) => {
    list.replaceChildren()
    for (const entry of mapping.operable) list.append(row(entry, true))
    for (const entry of mapping.inactive) list.append(row(entry, false))
    status.textContent = t(
      `${mapping.counts.operable} tokens de Mercados tienen mercado activo en Phoenix · ${mapping.counts.unsupported} todavía no tienen mercado de futuros.`,
      `${mapping.counts.operable} Markets tokens have an active Phoenix market · ${mapping.counts.unsupported} still have no futures market.`,
    )
  }

  const load = async () => {
    if (busy || disposed) return
    busy = true
    refresh.disabled = true
    status.textContent = t('Consultando Phoenix…', 'Reading Phoenix…')
    try {
      const catalog = await (client || createPhoenixPublicClient({now})).catalog()
      if (disposed) return
      render(mapMercadosToPhoenix(MARKETS_CATALOG, catalog))
    } catch {
      if (disposed) return
      list.replaceChildren()
      status.textContent = t(
        'No se pudo consultar Phoenix. No se muestran mercados inventados; vuelve a intentarlo.',
        'Phoenix could not be read. No invented markets are shown; try again.',
      )
    } finally {
      busy = false
      refresh.disabled = false
    }
  }
  refresh.onclick = () => { void load() }
  void load()

  return () => {
    disposed = true
    panel.remove()
  }
}
