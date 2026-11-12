import {DatabaseSync} from 'node:sqlite'
import {join} from 'node:path'
const p = new DatabaseSync(join(process.argv[2], 'phoenix.sqlite'), {readOnly: true})
const rows = p.prepare("SELECT id,state,kind,signature FROM phoenix_order_attempts WHERE state IN('PREPARED','SIGNED','UNKNOWN')").all()
console.log(JSON.stringify(rows.map(x => ({kind: x.kind, state: x.state, id: x.id.slice(0,8), signature: x.signature ? String(x.signature).slice(0,20) : null}))))
p.close()
