import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedTokenName,tokenNameKey,findTokenNameMatches,lookupTokenName,localTokenNameMatches} from '../lib/token-name-check.js';
import handler from '../api/token-name-check.js';
const mint='So11111111111111111111111111111111111111112';
test('normalizes case, accents, spacing, punctuation and compatibility forms',()=>{
 assert.equal(tokenNameKey(' JÁMD Dmaj '),tokenNameKey('jamd-dmaj'));
 assert.equal(tokenNameKey('ＪＡＭＤ'),tokenNameKey('JAMD'));
 for(const name of ['', '!!!','a\u200bb','a\nb','x'.repeat(61)])assert.throws(()=>checkedTokenName({name,symbol:'JAMD'}));
 const rows=[{mint,name:'Jamd-Dmaj',symbol:'OTHER',source:'test'},{mint,name:'Other',symbol:'jamd',source:'second'},{mint:'bad',name:'JamdDmaj',symbol:'JAMD'}];
 const found=findTokenNameMatches({name:'JamdDmaj',symbol:'JAMD'},rows);
 assert.equal(found.length,1);assert.equal(found[0].nameMatch,true);assert.equal(found[0].symbolMatch,true);assert.equal(found[0].sources.length,2);
});
test('local rooted issuance blocks a repeated name; failed receipts never reserve it',()=>{
 const identity={name:'JamdDmaj',symbol:'JAMD'};
 const read=state=>localTokenNameMatches(identity,{getItem:()=>JSON.stringify([{chain:'solana:mainnet',state,mint,...identity}])});
 assert.equal(read('confirmed').length,1);assert.equal(read('failed').length,0);
 assert.throws(()=>localTokenNameMatches(identity,{getItem:()=>'{bad'}));
});
test('checks both fields across Solana indexes and never promises global uniqueness',async()=>{
 const calls=[];
 const result=await lookupTokenName({name:'TestName',symbol:'TEST'},{now:()=>1000,fetchImpl:async(url,options)=>{
  calls.push(url);assert.equal(options.redirect,'manual');
  return String(url).includes('dexscreener')?Response.json({pairs:[{chainId:'ethereum',baseToken:{address:mint,name:'TestName',symbol:'TEST'}},{chainId:'solana',baseToken:{address:mint,name:'Different',symbol:'TEST'}}]}):Response.json([]);
 }});
 assert.equal(calls.length,4);assert.equal(result.status,'duplicate');assert.equal(result.matches[0].symbolMatch,true);
 assert.equal(result.matches[0].nameMatch,false);assert.equal(result.globalUniquenessGuaranteed,false);assert.equal(result.expiresAt,121000);
});
test('provider outages are not an availability result; one full source is usable but partial queries are not',async()=>{
 const identity={name:'Absent',symbol:'ABS'};
 let r=await lookupTokenName(identity,{fetchImpl:async()=>new Response('',{status:503})});assert.equal(r.status,'unavailable');
 r=await lookupTokenName(identity,{fetchImpl:async url=>String(url).includes('dexscreener')?Response.json({pairs:[]}):new Response('',{status:401})});
 assert.equal(r.status,'no-indexed-match');assert.equal(r.sources.filter(s=>s.available).length,1);
 r=await lookupTokenName(identity,{fetchImpl:async url=>String(url).includes('Absent')?Response.json(String(url).includes('dexscreener')?{pairs:[]}:[]):new Response('',{status:503})});assert.equal(r.status,'unavailable');
});
test('API validates fields and cannot mutate; source failure is 503, not available',async()=>{
 assert.equal((await handler(new Request('https://example.test/?name=x&symbol=bad!',{method:'GET'}))).status,400);
 assert.equal((await handler(new Request('https://example.test/',{method:'POST'}))).status,405);
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:503});
 try{const r=await handler(new Request('https://example.test/?name=UnavailableName&symbol=UNAV'));assert.equal(r.status,503);assert.equal((await r.json()).status,'unavailable');}finally{globalThis.fetch=old;}
});
