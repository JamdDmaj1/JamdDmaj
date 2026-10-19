import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFinanceRoute} from '../lib/finance-route.js';

test('all visitors can navigate directly to each financial section without an owner identity',()=>{
 for(const view of ['home','markets','trade','futures','assets'])assert.deepEqual(readFinanceRoute('#view='+view),{view,openAutomation:false,symbol:''});
 assert.deepEqual(readFinanceRoute('#view=automation&lang=es'),{view:'futures',openAutomation:true,symbol:''});
 assert.deepEqual(readFinanceRoute('#view=trade&symbol=btc'),{view:'trade',openAutomation:false,symbol:'BTC'});
});

test('public URLs cannot select administration, an owner wallet, activation, credentials or readiness',()=>{
 for(const view of ['admin','server','activate','__proto__'])assert.deepEqual(readFinanceRoute('#view='+view),{view:'home',openAutomation:false,symbol:''});
 const route=readFinanceRoute('#view=automation&ownerAccountHash=other&walletAddress=private&enabled=true&token=private&executionReady=true');
 assert.deepEqual(route,{view:'futures',openAutomation:true,symbol:''});assert.equal(Object.isFrozen(route),true);
 assert.equal(readFinanceRoute('#view=trade&symbol=%3Cscript%3E').symbol,'');
});

test('public menu exposes signals, futures, automation and assets without removing private server authorization',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const id of ['sideSignalsBtn','sideFuturesBtn','sideAutomationBtn','sideAssetsBtn'])assert.match(html,new RegExp('<button class="side-action" id="'+id+'" type="button">'));
 assert.match(html,/getElementById\("sideSignalsBtn"\)\.addEventListener\("click", enterTraderMode\)/);
 assert.match(html,/async function loadProServerState\(showActivity = false\) \{\s*if \(!telegramOwnerAuthorized\) return;/);
 assert.match(html,/async function checkTelegramOwnerAccess\(\)/);
 assert.doesNotMatch(html,/ready: "(?:Tap Scan now\. Hidden access|Toca Escanear\. Acceso oculto)/);
});
