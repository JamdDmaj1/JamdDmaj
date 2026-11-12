import {DatabaseSync} from 'node:sqlite'
import {join} from 'node:path'
const p = new DatabaseSync(join(process.argv[2], 'phoenix.sqlite'), {readOnly: true})
const r = p.prepare("SELECT signature,state FROM phoenix_order_attempts WHERE id='04cefca07143bede31b95bd6c5e9337d69f3a8118bc400a4746e62120eb1e8c7'").get()
console.log(String(r.signature)); p.close()
