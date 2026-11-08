// Phoenix positions and full-close review for the bot wallet. Read-only until a
// close is explicitly reviewed and confirmed: no entry, no retries, no
// automatic recovery. Entry stays unavailable until the server release gates.
import {selectedWalletAccount} from './wallet-portfolio-store.js'
import {createPhoenixManualClient} from './phoenix-manual-client.js'

export function setupPhoenixPositionsPanel(parent, language, doc = document, {client} = {}) {
  if (!parent) return () => {}
  const t = (es, en) => (language === 'es' ? es : en)
  const node = (tag, text) => {
    const value = doc.createElement(tag)
    if (text) value.textContent = text
    return value
  }
  const panel = node('details')
  panel.id = 'phoenix-positions'
  panel.className = 'card phoenix-positions'
  panel.append(node('summary', t('Posiciones Phoenix · billetera del bot', 'Phoenix positions · bot wallet')))
  panel.append(node('p', t(
    'Solo lectura y cierre completo revisado. Las entradas nuevas siguen bloqueadas hasta que el servidor habilite el venue; aquí no se abre nada.',
    'Read-only and reviewed full close. New entries stay blocked until the server enables the venue; nothing opens here.',
  )))
  const load = node('button', t('Consultar posiciones', 'Read positions'))
  load.type = 'button'
  const status = node('p')
  status.setAttribute('role', 'status')
  const list = node('div')
  const review = node('div')
  const consent = node('input')
  consent.type = 'checkbox'
  const confirm = node('button', t('Confirmar cierre completo', 'Confirm full close'))
  confirm.type = 'button'
  confirm.disabled = true
  const consentLabel = node('label')
  consentLabel.append(consent, node('span', t(' Revisé el precio límite, el importe estimado y las comisiones. Autorizo este cierre completo.', ' I reviewed the price limit, estimated amount and fees. I authorize this full close.')))
  review.append(consentLabel, confirm)
  review.hidden = true
  panel.append(load, status, list, review)
  parent.append(panel)

  const perps = client || createPhoenixManualClient({})
  let disposed = false
  let busy = false
  let pending = null
  const wallet = () => {
    const account = selectedWalletAccount(doc)
    return account?.source === 'watch' ? account.address : null
  }
  const render = () => {
    load.disabled = busy || disposed || !wallet()
    confirm.disabled = busy || !pending || !consent.checked
  }
  const message = (error) => {
    const code = String(error?.code || error?.message || '')
    if (code.includes('phoenix-unavailable')) return t('Phoenix todavía no está habilitado en el servidor para esta cuenta.', 'Phoenix is not yet enabled on the server for this account.')
    if (code.includes('session')) return t('Inicia sesión para consultar la billetera del bot.', 'Sign in to read the bot wallet.')
    return t('No se pudo completar la consulta. Código: ', 'The request could not be completed. Code: ') + (code || 'unknown')
  }

  const showReview = (r) => {
    review.replaceChildren()
    const lines = [
      t('Cierre completo · ', 'Full close · ') + r.symbol + ' ' + r.side,
      t('Precio de referencia: ', 'Reference price: ') + r.referencePrice,
      t('Límite de precio: ', 'Price limit: ') + r.priceLimitUsd,
      t('Recibes (estimado, no garantizado): ', 'You receive (estimated, not guaranteed): ') + r.estimatedReceivedCollateralUnits + ' ' + t('unidades mínimas', 'base units'),
      t('Comisión de red máxima: ', 'Maximum network fee: ') + (Number(r.maximumNetworkAndRentLamports) / 1e9) + ' SOL',
    ]
    for (const line of lines) review.append(node('p', line))
    review.append(consentLabel, confirm)
    review.hidden = false
    consent.checked = false
    pending = r
    render()
  }

  const run = async (fn) => {
    if (busy || disposed) return
    busy = true
    render()
    try { await fn() } catch (error) { status.textContent = message(error) } finally { busy = false; if (!disposed) render() }
  }

  load.onclick = () => run(async () => {
    const address = wallet()
    if (!address) return
    status.textContent = t('Consultando posiciones…', 'Reading positions…')
    const data = await perps.positions(address)
    if (disposed || wallet() !== address) return
    list.replaceChildren()
    review.hidden = true
    pending = null
    const items = Array.isArray(data.items) ? data.items : []
    if (!items.length) {
      status.textContent = t('No se observaron posiciones abiertas en esta consulta.', 'No open positions were observed in this read.')
      return
    }
    for (const item of items) {
      const row = node('div')
      row.className = 'phoenix-position-row'
      row.append(node('strong', item.symbol + ' · ' + t('subcuenta ', 'subaccount ') + item.subaccountIndex))
      const button = node('button', t('Revisar cierre', 'Review close'))
      button.type = 'button'
      button.onclick = () => run(async () => {
        status.textContent = t('Preparando la revisión del cierre…', 'Preparing the close review…')
        showReview(await perps.prepareClose(address, item.workflowId))
        status.textContent = t('Revisa el cierre y confirma por separado.', 'Review the close and confirm separately.')
      })
      row.append(button)
      list.append(row)
    }
    status.textContent = t('Posiciones consultadas. El cierre se revisa una por una.', 'Positions read. Closes are reviewed one at a time.')
  })

  confirm.onclick = () => run(async () => {
    const r = pending
    if (!r || !consent.checked) return
    pending = null
    review.hidden = true
    status.textContent = t('Cierre enviado a revisión final. Consulta el resultado; no lo repitas.', 'Close submitted for final review. Check the result; do not repeat it.')
    const result = await perps.confirmClose(r, true)
    if (!disposed) status.textContent = t('Estado del cierre: ', 'Close state: ') + (result?.state || 'UNKNOWN') + ' · ' + (result?.phase || '')
  })

  consent.onchange = render
  render()

  return () => {
    disposed = true
    panel.remove()
  }
}
