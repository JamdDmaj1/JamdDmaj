import {DatabaseSync} from 'node:sqlite'
import {join} from 'node:path'
const p = new DatabaseSync(join(process.argv[2], 'phoenix.sqlite'), {readOnly: true})
const row = p.prepare("SELECT id,state,kind,signature FROM phoenix_order_attempts WHERE state IN('PREPARED','SIGNED','UNKNOWN')").get()
p.close()
const rpc = process.env.JAMDDMAJ_PERPS_RPC_URL
const out = {ORDERS: 1, kind: row ? row.kind : null, state: row ? row.state : null, hasSignature: !!(row && row.signature)}
if (row && row.signature && rpc) {
  try {
    const body = {jsonrpc:'2.0',id:1,method:'getSignatureStatuses',params:[[row.signature],{searchTransactionHistory:true}]}
    const r = await fetch(rpc, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)})
    const d = await r.json()
    const v = d.result && d.result.value ? d.result.value[0] : null
    out.onChain = v ? true : false
    out.slot = v ? v.slot : null
    out.err = v ? Boolean(v.err) : null
  } catch (error) { out.checkError = String(error && error.message || error) }
}
console.log(JSON.stringify(out))
