import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {inspectServerPerpsFunding} from '../lib/perps-server-funding.js';
import {PERPS_PROGRAM,PERPS_CUSTODIES} from '../lib/perps-server-custody.js';
const SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const key=n=>bs58.encode(Buffer.alloc(32,n)),payer=key(1),source=key(2),position=key(3),other=key(4);
function account(owner,lamports,data=Buffer.alloc(0)){return {owner,executable:false,lamports:String(lamports),data:[data.toString('base64'),'base64']};}
function token(amount,mint=PERPS_CUSTODIES.USDC.mint){const b=Buffer.alloc(165);Buffer.from(bs58.decode(mint)).copy(b);Buffer.from(bs58.decode(payer)).copy(b,32);b.writeBigUInt64LE(BigInt(amount),64);b[108]=1;return account(TOKEN,2000000,b);}
function fixture(){return {payer,source,marginUnits:'10000000',feeLamports:'15100',before:{[payer]:account(SYSTEM,100000000),[source]:token(20000000),[position]:null,[other]:token(123)},after:{[payer]:account(SYSTEM,97984900),[source]:token(10000000),[position]:account(PERPS_PROGRAM,2000000,Buffer.alloc(210)),[other]:token(123)},rents:{[position]:{program:PERPS_PROGRAM,minimum:'2000000'}}};}
function mutateData(state,fn){const b=Buffer.from(state.data[0],'base64');fn(b);state.data[0]=b.toString('base64');}
test('funding accounts for exact USDC debit, network fee and locked SOL rent using integers',()=>{
 const result=inspectServerPerpsFunding(fixture());assert.equal(result.usdcDebitUnits,'10000000');assert.equal(result.rentLockedLamports,'2000000');assert.equal(result.rentRefundedLamports,'0');assert.equal(result.readyForSigning,false);assert.ok(Object.isFrozen(result));
});
test('spending drift, authority changes, unrelated token movement and malformed accounts reject',()=>{
 for(const mutate of [
  f=>f.after[source]=token(9999999),f=>f.after[source]=token(10000001),f=>f.after[source].lamports='1999999',
  f=>f.after[payer].lamports='97984899',f=>f.after[other]=token(122),f=>f.after[other]=null,
  f=>mutateData(f.after[source],b=>b[108]=2),f=>mutateData(f.after[source],b=>b[72]=1),
  f=>mutateData(f.after[source],b=>b[109]=1),f=>mutateData(f.after[source],b=>{b[129]=1;b[133]=5;}),
  f=>mutateData(f.after[source],b=>b[121]=1),f=>mutateData(f.after[source],b=>b[73]=1),
  f=>{delete f.after[other];},f=>f.before[source]=token(9999999),f=>f.feeLamports='1000001',
  f=>f.after[position].lamports='2000001',f=>f.rents[position].minimum='0',f=>f.after[payer].executable=true,
  f=>f.after[other].data[0]+='\n',f=>f.before[payer].lamports=Number.MAX_SAFE_INTEGER+1,
 ]){const f=fixture();mutate(f);assert.throws(()=>inspectServerPerpsFunding(f),/PERPS_SIMULATED_FUNDING_MISMATCH/);}
});
test('source rent refund is allowed only when exactly the full USDC amount was spent',()=>{
 const f=fixture();f.before[source]=token(10000000);f.after[source]=null;f.after[payer].lamports='99984900';
 assert.equal(inspectServerPerpsFunding(f).rentRefundedLamports,'2000000');
 f.before[source]=token(10000001);assert.throws(()=>inspectServerPerpsFunding(f));
});
test('new wallet token accounts must be empty, declared and rent exact',()=>{
 const f=fixture(),address=key(5);f.before[address]=null;f.after[address]=token(0);f.rents[address]={program:TOKEN,minimum:'2000000',tokenOwner:payer,mint:PERPS_CUSTODIES.USDC.mint};f.after[payer].lamports='95984900';
 assert.equal(inspectServerPerpsFunding(f).rentLockedLamports,'4000000');
 f.after[address]=token(1);assert.throws(()=>inspectServerPerpsFunding(f));
 f.after[address]=token(0);delete f.rents[address];assert.throws(()=>inspectServerPerpsFunding(f));
});
test('only authorized empty funding closures refund rent; Token-2022 holdings remain untouched',()=>{
 const f=fixture();f.before[other]=token(0);f.after[other]=null;f.emptyFundingClosures={[other]:PERPS_CUSTODIES.USDC.mint};f.after[payer].lamports='99984900';
 assert.equal(inspectServerPerpsFunding(f).rentRefundedLamports,'2000000');
 f.before[other]=token(1);assert.throws(()=>inspectServerPerpsFunding(f));
 const g=fixture();g.before[other].owner=g.after[other].owner='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';inspectServerPerpsFunding(g);
 mutateData(g.after[other],b=>b[64]^=1);assert.throws(()=>inspectServerPerpsFunding(g));
});
