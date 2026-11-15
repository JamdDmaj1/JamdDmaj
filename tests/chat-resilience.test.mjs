import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const chatApi=readFileSync(new URL('../api/chat.js',import.meta.url),'utf8');

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

test('managed chat retries transient provider failures once',()=>{
 assert.match(chatApi,/for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
 assert.match(chatApi,/\[429, 502, 503, 504\]/);
});
