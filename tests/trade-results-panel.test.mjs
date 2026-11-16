import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const telegram=readFileSync(new URL('../api/telegram.js',import.meta.url),'utf8');
const pro=readFileSync(new URL('../api/pro.js',import.meta.url),'utf8');
test('Trade Results can render group messages',()=>{
 assert.match(html,/groupWinners/);
 assert.match(html,/telegramMessages/);
 assert.match(pro,/telegramMessages/);
 assert.match(telegram,/recordTelegramUpdate/);
 assert.match(telegram,/x-telegram-bot-api-secret-token/);
});

test('Trade Results lists only Telegram-sent winners',()=>{
 assert.match(html,/id="tradeResultsList"/);
 assert.match(html,/function renderTradeResults/);
 assert.match(html,/signal.telegramSentAt/);
 assert.match(html,/renderTradeResults\(state\.history/);
});
