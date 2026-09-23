import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTestWalletLifecycle} from '../lib/experimental-wallet-lifecycle.js';
const password='Disposable testing password only 2026';
test('test wallet requires restored encrypted backup before unlocking',async()=>{
 const wallet=createTestWalletLifecycle();const backup=await wallet.create(password);
 assert.equal(wallet.state.phase,'backup-required');assert.equal(wallet.state.productionReady,false);
 assert.throws(()=>wallet.testAddress(),/locked/);await assert.rejects(wallet.unlock(password),/not-locked/);
 await assert.rejects(wallet.confirmRecovery(backup,'Different testing password only'),/Invalid/);
 assert.equal(wallet.state.phase,'backup-required');await wallet.confirmRecovery(JSON.parse(JSON.stringify(backup)),password);
 await wallet.unlock(password);const first=wallet.testAddress();assert.equal(first.network,'solana:devnet');assert.equal(first.testOnly,true);
 wallet.lock();assert.throws(()=>wallet.testAddress(),/locked/);await wallet.unlock(password);assert.equal(wallet.testAddress().address,first.address);
 wallet.dispose();assert.equal(wallet.state.phase,'empty');assert.throws(()=>wallet.testAddress());
 const recovered=createTestWalletLifecycle();await recovered.restore(JSON.parse(JSON.stringify(backup)),password);
 assert.equal(recovered.state.phase,'locked');await recovered.unlock(password);assert.equal(recovered.testAddress().address,first.address);recovered.dispose();
});
test('locking during unlock cancels the pending result',async()=>{
 const wallet=createTestWalletLifecycle(),backup=await wallet.create(password);await wallet.confirmRecovery(backup,password);
 const pending=wallet.unlock(password);wallet.lock();await assert.rejects(pending,/cancelled/);assert.equal(wallet.state.phase,'locked');wallet.dispose();
});
test('wallet cryptography stays outside published browser assets',()=>{
 const build=readFileSync(new URL('../scripts/build-web.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(build,/experimental-wallet/);
 const ui=readFileSync(new URL('../assets-wallet-ui.js',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/experimental-wallet|sendTransaction|signTransaction|personal_sign|eth_send/);
});
