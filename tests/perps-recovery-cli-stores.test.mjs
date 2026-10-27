import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRecoveryArchiveStores} from '../lib/perps-recovery-cli-stores.js';
const base=['archive','--directory','wallets','--key-file','key','--controls','controls.sqlite','--journal','journal.sqlite','--recipient-file','recipient','--registry','registry.sqlite','--output','backup.age'];
test('recovery archive keeps legacy mode and supports complete fees and swaps',()=>{
 assert.deepEqual(parseRecoveryArchiveStores(base),{});
 assert.deepEqual(parseRecoveryArchiveStores([...base,'--swaps','swaps.sqlite']),{swapsPath:'swaps.sqlite'});
 assert.deepEqual(parseRecoveryArchiveStores([...base,'--fees','fees.sqlite','--payments','payments.sqlite','--swaps','swaps.sqlite']),{feesPath:'fees.sqlite',paymentsPath:'payments.sqlite',swapsPath:'swaps.sqlite'});
});
test('recovery archive rejects partial fees, duplicates, aliases and unknown flags',()=>{
 for(const tail of [['--fees','fees.sqlite'],['--payments','payments.sqlite'],['--swaps'],['--unknown','unknown.sqlite'],['--swaps','controls.sqlite'],['--swaps','backup.age'],['--swaps','s.sqlite','--swaps','s2.sqlite'],['--fees','f.sqlite','--payments','./f.sqlite']])assert.throws(()=>parseRecoveryArchiveStores([...base,...tail]));
});
