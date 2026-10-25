import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../android/app/src/main/java/com/jamddmaj/ai/wallet/NativeWalletActivity.java',import.meta.url),'utf8');
test('main-wallet biometric access check verifies identity without a financial signer or builder',()=>{
  const start=source.indexOf('private void unlock(String ownerId)'),end=source.indexOf('private void updateSwapAmountUnit()',start);
  assert.ok(start>0&&end>start);const access=source.slice(start,end);
  for(const expected of ['BIOMETRIC_STRONG','operation.authenticationCipher()','result.getCryptoObject().getCipher()!=operation.authenticationCipher()','operation.completeOpen','NativeHdWallet.addresses(entropy)','Wallet metadata mismatch'])assert.ok(access.includes(expected),expected);
  for(const forbidden of ['signReviewed(','.submit(','signSolana(','reviewPerps(','reviewSwap(','prepareAmount('])assert.equal(access.includes(forbidden),false,forbidden);
  assert.match(source,/Verify biometrics without trading/);
  assert.match(access,/No transaction was signed or sent/);
  assert.match(source,/private void lock\(\)\{epoch\+\+;if\(accessCheckStatus!=null\)accessCheckStatus.setText\(""\)/);
});
