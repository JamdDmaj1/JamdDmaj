import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {getCompiledTransactionMessageEncoder,getCompiledTransactionMessageDecoder} from '@solana/kit';
import bs58 from 'bs58';

// Independent SDK encoding of the raw-instruction fixture in the Java check.
// All addresses and blockhashes are synthetic. No RPC, signatures or funds.
const [java,classpath]=process.argv.slice(2);
if(!java||!classpath)throw new Error('Provide Java executable and test classpath');
const output=execFileSync(java,['-cp',classpath,'com.jamddmaj.ai.wallet.SolanaMessageCompilerCheck'],{encoding:'utf8'});
const key=n=>bs58.encode(Uint8Array.from({length:32},(_,i)=>i===0?n:0));
for(const version of ['legacy',0]) {
  const legacy=version==='legacy';
  const expected={version,lifetimeToken:key(9),
    header:{numSignerAccounts:1,numReadonlySignerAccounts:0,numReadonlyNonSignerAccounts:legacy?3:1},
    staticAccounts:(legacy?[1,4,6,2,3,5]:[1,2]).map(key),
    instructions:[{programAddressIndex:legacy?3:1,accountIndices:legacy?[0,4,1,5,2]:[0,4,2,5,3],data:Uint8Array.of(7)}],
    ...(legacy?{}:{addressTableLookups:[20,21].map(n=>({lookupTableAddress:key(n),writableIndexes:[1],readonlyIndexes:[0]}))})};
  const actual=Buffer.from(output.match(new RegExp(`^${legacy?'LEGACY':'V0'}=(.+)$`,'m'))?.[1]??'','base64');
  assert.deepEqual(actual,Buffer.from(getCompiledTransactionMessageEncoder().encode(expected)));
  const decoded=getCompiledTransactionMessageDecoder().decode(actual);
  assert.deepEqual(decoded.staticAccounts,expected.staticAccounts);
  assert.deepEqual(decoded.header,expected.header);
}
console.log('Native legacy/v0 compilation matches independent Solana Kit bytes. No transaction submitted.');
