import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const chatApi=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');

test('older turns are summarized for continuity',()=>{
 assert.match(html,/buildConversationDigest/);
 assert.match(html,/Earlier conversation digest/);
});

test('Learn uses a compact tutor prompt instead of the full product manual',()=>{
 assert.match(html,/const compactTutor = Boolean\(learningSession\);/);
 assert.match(html,/content: compactTutor/);
 assert.match(html,/slice\(compactTutor \? -6 : -8\)/);
});

test('a stalled tutor stream is aborted instead of typing forever',()=>{
 assert.match(html,/JamdDmajTimeoutError/);
 assert.match(html,/readWithTimeout/);
 assert.match(html,/AI_STREAM_TIMEOUT/);
});

test('managed chat streams the provider instead of buffering the whole answer',()=>{
 assert.match(chatApi,/const wantsStream = input.stream !== false;/);
 assert.match(chatApi,/stream: wantsStream/);
 assert.match(chatApi,/if \(wantsStream\)/);
});

test('managed chat retries transient provider failures once',()=>{
 assert.match(chatApi,/for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
 assert.match(chatApi,/\[400, 404, 429, 502, 503, 504\]/);
 assert.match(chatApi,/for \(const candidate of/);
});
