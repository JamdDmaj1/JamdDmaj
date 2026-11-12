import {DatabaseSync} from 'node:sqlite'
import {join} from 'node:path'
const p = new DatabaseSync(join(process.argv[2], 'phoenix.sqlite'), {readOnly: true})
const rows = p.prepare("SELECT id,state,kind,signature,workflow FROM phoenix_order_attempts WHERE state IN('PREPARED','SIGNED','UNKNOWN')").all()
console.log(JSON.stringify({orders: rows.map(x => ({kind: x.kind, state: x.state, signature: x.signature ?? null, workflow: String(x.workflow).slice(0,8)}))}))
p.close()
