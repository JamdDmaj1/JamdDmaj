import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestFileJournal} from '../scripts/lib/test-transfer-journal.mjs';
const record={version:1,owner:'test-owner',network:'solana:devnet',signature:'test-signature',lastValidBlockHeight:42,phase:'uncertain'};
test('file journal survives reopening and rejects new transactions until resolved',()=>{
 const path=join(mkdtempSync(join(tmpdir(),'jamddmaj-journal-test-')),'transfer.json');
 const first=createTestFileJournal(path);first.save(record);const second=createTestFileJournal(path);assert.deepEqual(second.load(),record);
 assert.throws(()=>second.save({...record,signature:'other'}),/unresolved/);assert.deepEqual(first.load(),record);
 second.save({...record,phase:'confirmed'});second.save({...record,signature:'other'});assert.equal(first.load().signature,'other');
 assert.throws(()=>second.save({...record,secret:'not-permitted'}),/fields/);assert.equal(readFileSync(path,'utf8').includes('secret'),false);
});
test('existing journal lock fails closed without deleting another process lock',()=>{
 const path=join(mkdtempSync(join(tmpdir(),'jamddmaj-journal-test-')),'transfer.json');writeFileSync(path+'.lock','occupied');
 assert.throws(()=>createTestFileJournal(path).save(record),/EEXIST/);assert.equal(readFileSync(path+'.lock','utf8'),'occupied');
});
