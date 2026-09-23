import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvmReadOnlySession,formatNativeBalance,normalizeChain} from '../lib/external-wallet-session.js';
const owner='0x'+'1'.repeat(40);
function mock(){
 const events=new Map(),calls=[];
 const p={chain:'0x38',accounts:[owner],value:'0x0',calls,
 on(k,fn){events.set(k,fn)},removeListener(k){events.delete(k)},emit(k,v){events.get(k)?.(v)},
 async request({method,params}){calls.push({method,params});if(method==='eth_requestAccounts'||method==='eth_accounts')return this.accounts;if(method==='eth_chainId')return this.chain;if(method==='eth_getBalance')return this.value;throw new Error('Forbidden method')}
 };return p;
}
test('read-only connection and exact native balances, including zero',async()=>{
 const p=mock(),s=createEvmReadOnlySession(p);assert.equal((await s.connect()).symbol,'BNB');
 assert.equal((await s.balance()).amount,'0');p.value='0xde0b6b3a7640001';assert.equal((await s.balance()).amount,'1.000000000000000001');
 assert.ok(p.calls.every(c=>['eth_requestAccounts','eth_accounts','eth_chainId','eth_getBalance'].includes(c.method)));s.disconnect();
 await assert.rejects(s.balance(),/disconnected/);
});
test('chain/account changes invalidate balances and remove listeners on disconnect',async()=>{
 const p=mock();let cleared=0;const s=createEvmReadOnlySession(p,x=>{if(!x)cleared++});await s.connect();p.emit('accountsChanged',[]);
 await assert.rejects(s.balance(),/disconnected/);s.disconnect();const before=cleared;p.emit('chainChanged','0x1');assert.equal(cleared,before);
});
test('unsupported chain, malformed quantities and zero addresses fail closed',async()=>{
 for(const v of ['0x89','0x61','56',null])assert.throws(()=>normalizeChain(v));
 for(const v of ['0x',-1,null,'12','0x'+'f'.repeat(65)])assert.throws(()=>formatNativeBalance(v));
 const p=mock();p.accounts=['0x'+'0'.repeat(40)];await assert.rejects(createEvmReadOnlySession(p).connect(),/invalid-account/);
});
test('late balance response cannot overwrite a changed account',async()=>{
 const p=mock(),request=p.request;p.request=async function(args){const value=await request.call(this,args);if(args.method==='eth_getBalance')this.emit('accountsChanged',[]);return value};
 const s=createEvmReadOnlySession(p);await s.connect();await assert.rejects(s.balance(),/account-changed/);s.disconnect();
});
test('initial authorization event is accepted, a mismatched confirmation is not',async()=>{
 const p=mock(),request=p.request;p.request=async function(args){if(args.method==='eth_requestAccounts')this.emit('accountsChanged',[owner]);return request.call(this,args)};
 const s=createEvmReadOnlySession(p);assert.equal((await s.connect()).address,owner);s.disconnect();
 const other=mock();other.request=async function(args){if(args.method==='eth_accounts')return ['0x'+'2'.repeat(40)];return request.call(this,args)};
 await assert.rejects(createEvmReadOnlySession(other).connect(),/account-changed/);
});
