import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,chmodSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {provisionDedicatedPerpsFeedCredential,readDedicatedPerpsFeedCredential} from '../lib/perps-feed-credential.js';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'jamd-feed-credential-'));chmodSync(root,0o700);t.after(()=>rmSync(root,{recursive:true,force:true}));return {directory:join(root,'config'),explicitCredentialApproval:true,allowNonPosixForTests:process.platform==='win32'};}
test('dedicated read-feed credential is private, stable, never serialized, and grants no execution capability',t=>{
 const input=fixture(t),first=provisionDedicatedPerpsFeedCredential(input),secret=readDedicatedPerpsFeedCredential(input),before=readFileSync(first.secretFile);
 assert.match(secret,/^[a-f0-9]{64}$/);assert.equal(first.reused,false);assert.equal(first.tradingEnabled,false);assert.equal(first.readyForSigning,false);
 assert.equal(JSON.stringify(first).includes(secret),false);const second=provisionDedicatedPerpsFeedCredential(input);assert.equal(second.reused,true);
 assert.deepEqual(readFileSync(second.secretFile),before);assert.equal(readDedicatedPerpsFeedCredential(input),secret);
});
test('absent approval, an unrelated file or a malformed value cannot create, overwrite, or borrow legacy credentials',t=>{
 const input=fixture(t);assert.throws(()=>provisionDedicatedPerpsFeedCredential({...input,explicitCredentialApproval:false}));assert.equal(existsSync(input.directory),false);
 const prepared=provisionDedicatedPerpsFeedCredential(input);
 for(const text of ['JAMDDMAJ_CRON_SECRET='+ 'a'.repeat(64)+'\n','JAMDDMAJ_CLIENT_FEED_TOKEN=short\n','JAMDDMAJ_CLIENT_FEED_TOKEN='+ 'a'.repeat(64)+'\nBITGET_MODE=live\n']){
  writeFileSync(prepared.secretFile,text,{mode:0o600});assert.throws(()=>provisionDedicatedPerpsFeedCredential(input));assert.equal(readFileSync(prepared.secretFile,'utf8'),text);
 }
});
