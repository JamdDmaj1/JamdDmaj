import test from 'node:test';
import assert from 'node:assert/strict';
import {webWalletPendingText,webWalletReviewSeconds} from '../lib/web-wallet-status.js';
test('pending messages distinguish final, failed, confirming and unknown without inviting resubmission',()=>{
 assert.match(webWalletPendingText(null),/No hay/);
 assert.match(webWalletPendingText({state:'FINALIZED',signature:'fixture'}),/Confirmada definitivamente/);
 assert.match(webWalletPendingText({state:'FAILED',signature:'fixture'}),/falló/);
 assert.match(webWalletPendingText({state:'CONFIRMING',signature:'fixture'}),/No la repitas/);
 assert.match(webWalletPendingText({state:'UNKNOWN',signature:'fixture'}),/No repitas/);
 assert.match(webWalletPendingText({state:'unexpected'}),/Resultado aún desconocido/);
});
test('review countdown never implies an expired quote is still current',()=>{
 assert.equal(webWalletReviewSeconds(15000,1),15);assert.equal(webWalletReviewSeconds(15000,14999),1);assert.equal(webWalletReviewSeconds(15000,15000),0);assert.equal(webWalletReviewSeconds(15000,15001),0);assert.equal(webWalletReviewSeconds(NaN),0);
});
