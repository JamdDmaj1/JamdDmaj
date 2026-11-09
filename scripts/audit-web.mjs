// Public web audit: every served page, every internal reference and the candle feed.
const base = 'https://www.jamddmaj.com/'
const pages = (process.argv[2] ? process.argv[2].split(',') : ['index.html','private-simulator.html','wallet-web.html','discover.html','fee-recipient-setup.html','google-mobile.html','hyperliquid-testnet.html','oauth-mobile.html'])
const stamp = () => '?x=' + Math.random()
let failures = 0
for (const page of pages) {
  const response = await fetch(base + page + stamp(), {cache: 'no-store'})
  const html = await response.text()
  const refs = new Set()
  for (const match of html.matchAll(/(?:href|src)="([^"#?]+)"/g)) {
    const ref = match[1]
    if (/^(https?:|mailto:|data:|javascript:)/.test(ref)) continue
    refs.add(ref.replace(/^\.\//, ''))
  }
  const broken = []
  for (const ref of refs) {
    const target = ref.startsWith('/') ? base.slice(0, -1) + ref : base + ref
    const probe = await fetch(target + (target.includes('?') ? '&' : '?') + 'x=' + Math.random(), {cache: 'no-store'})
    if (!probe.ok) broken.push(ref + ' ' + probe.status)
  }
  if (!response.ok) broken.push('page ' + response.status)
  failures += broken.length
  console.log(page, response.status, refs.size + ' refs', broken.length ? 'BROKEN ' + broken.join(', ') : 'ok')
}
const feed = await fetch(base + 'api/market-asset?symbol=DOGE&coinId=doge&timeframe=1h&x=' + Math.random(), {cache: 'no-store'})
const data = await feed.json().catch(() => null)
const candles = Array.isArray(data && data.candles) ? data.candles.length : 0
if (!feed.ok || candles < 2) { failures++; console.log('candles', feed.status, 'BROKEN') } else console.log('candles', feed.status, candles + ' rows', 'ok')
console.log(failures ? 'AUDIT FAILED ' + failures : 'AUDIT OK')
process.exit(failures ? 1 : 0)
