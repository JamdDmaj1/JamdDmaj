import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,readdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {initializeEmptyPerpsRuntime,PERPS_RUNTIME_INITIALIZATION_MARKER} from '../lib/perps-runtime-initialization.js';
import {openServerPerpsRuntime} from '../lib/perps-server-runtime.js';
const allowNonPosixForTests=process.platform==='win32';
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'jamd-init-unfunded-'));chmodSync(directory,0o700);t.after(()=>rmSync(directory,{recursive:true,force:true}));return {directory,allowNonPosixForTests,explicitInitializationApproval:true};}

test('explicit empty initialization creates private reviewed stores, no owner wallet, and a maintenance-capable runtime',async t=>{
 const options=fixture(t),result=initializeEmptyPerpsRuntime(options);
 assert.deepEqual(result,{stage:'EMPTY_RUNTIME_INITIALIZED',custodyWallets:0,backupVerified:false,fundingAvailable:false,readyForSigning:false,tradingEnabled:false});
 assert.deepEqual(readdirSync(join(options.directory,'wallets')),[]);assert.equal(readFileSync(join(options.directory,'keys','master.key')).length,32);
 assert.equal(existsSync(join(options.directory,PERPS_RUNTIME_INITIALIZATION_MARKER)),false);
 const runtime=openServerPerpsRuntime({...options,fetchImpl:async()=>{throw Error('NO_NETWORK_IN_INITIALIZATION_TEST');}});
 try{const report=await runtime.run({once:true});assert.equal(report.mode,'maintenance');assert.equal(report.readyForSigning,false);assert.equal(runtime.capabilities().executionAvailable,false);}finally{await runtime.close();}
});

test('initialization requires explicit consent and never overwrites or repairs any nonempty destination',t=>{
 const options=fixture(t);
 for(const approval of [false,undefined,'true',1])assert.throws(()=>initializeEmptyPerpsRuntime({...options,explicitInitializationApproval:approval}));
 assert.deepEqual(readdirSync(options.directory),[]);
 const sentinel=join(options.directory,'existing-user-state');writeFileSync(sentinel,'PRESERVE',{mode:0o600});
 assert.throws(()=>initializeEmptyPerpsRuntime(options));assert.equal(readFileSync(sentinel,'utf8'),'PRESERVE');assert.deepEqual(readdirSync(options.directory),['existing-user-state']);
});

test('a repeated initializer cannot replace the master key and a partial-initialization marker blocks worker startup',t=>{
 const options=fixture(t);initializeEmptyPerpsRuntime(options);const keyFile=join(options.directory,'keys','master.key'),before=readFileSync(keyFile);
 assert.throws(()=>initializeEmptyPerpsRuntime(options));assert.deepEqual(readFileSync(keyFile),before);
 writeFileSync(join(options.directory,PERPS_RUNTIME_INITIALIZATION_MARKER),'INCOMPLETE_REQUIRES_OPERATOR_REVIEW',{mode:0o600});
 assert.throws(()=>openServerPerpsRuntime(options));assert.equal(existsSync(join(options.directory,'worker.lock')),false);assert.deepEqual(readFileSync(keyFile),before);
});

test('insecure initialization directories fail before generating any key',{skip:process.platform==='win32'},t=>{
 const options=fixture(t);chmodSync(options.directory,0o755);assert.throws(()=>initializeEmptyPerpsRuntime(options));assert.deepEqual(readdirSync(options.directory),[]);
});

test('actual Linux initialization CLI requires operator approval and rejects a second initialization',{skip:process.platform==='win32'},t=>{
 const options=fixture(t),cli=process.env.JAMDDMAJ_TEST_PERPS_INITIALIZE_CLI||fileURLToPath(new URL('../scripts/perps-runtime-initialize.mjs',import.meta.url));
 const runOptions={encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']};
 assert.throws(()=>execFileSync(process.execPath,[cli,options.directory],runOptions));assert.deepEqual(readdirSync(options.directory),[]);
 const result=JSON.parse(execFileSync(process.execPath,[cli,'--approve-empty-runtime',options.directory],runOptions));assert.equal(result.custodyWallets,0);assert.equal(result.readyForSigning,false);
 assert.throws(()=>execFileSync(process.execPath,[cli,'--approve-empty-runtime',options.directory],runOptions));
});
