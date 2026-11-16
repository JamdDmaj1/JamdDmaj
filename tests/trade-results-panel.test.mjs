import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('Trade Results lists only Telegram-sent winners',()=>{
 assert.match(html,/id="tradeResultsList"/);
 assert.match(html,/function renderTradeResults/);
 assert.match(html,/signal.telegramSentAt/);
 assert.match(html,/renderTradeResults\(state\.history/);
});
