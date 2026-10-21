import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebPerpsReviewCommand} from '../lib/perps-web-review-command.js';
import {createHandler} from '../api/perps-signing-review.js';
const key='jamd:web-perps:review:v1:'+'a'.repeat(64);
test('unsigned review REST storage allows only bounded GET and SET-NX with a short lease',async()=>{
 const calls=[],command=createWebPerpsReviewCommand({url:'https://fixture.upstash.io',token:'test-only-token',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({result:JSON.parse(options.body)[0]==='SET'?'OK':'stored'});}});
 assert.equal(await command(['SET',key,'record','EX',120,'NX']),'OK');assert.equal(await command(['GET',key]),'stored');
 assert.equal(calls[0].url,'https://fixture.upstash.io/');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Authorization,'Bearer test-only-token');
 for(const value of [['DEL',key],['EVAL','anything'],['GET','another-key'],['SET',key,'x','EX',9999,'NX'],['SET',key,'x'],['GET',key,'extra'],['SET',key,'x'.repeat(8193),'EX',120,'NX']])await assert.rejects(command(value));
 assert.equal(calls.length,2);
});
test('storage redirects, authentication errors, malformed or oversized replies never acknowledge persistence',async()=>{
 for(const response of [()=>Response.json({error:'must-not-leak-token'}),()=>Response.json({result:5}),()=>Response.json({result:'OK',extra:true}),
  ()=>new Response('failure',{status:401}),()=>new Response('x'.repeat(16385),{headers:{'Content-Type':'application/json'}}),()=>Response.json({result:'OK'},{headers:{'Content-Length':'16385'}})]){
  const command=createWebPerpsReviewCommand({url:'https://fixture.upstash.io',token:'test-only-token',fetchImpl:async()=>response()});
  await assert.rejects(command(['GET',key]),{message:'WEB_PERPS_REVIEW_STORAGE_UNAVAILABLE'});
 }
 for(const url of ['http://fixture.upstash.io','https://user:pass@fixture.upstash.io','https://fixture.upstash.io/pipeline','https://fixture.upstash.io/?token=bad'])assert.throws(()=>createWebPerpsReviewCommand({url,token:'test-only-token',fetchImpl:async()=>{}}));
});
test('a copied display review cannot make the signing endpoint return a transaction packet',async()=>{
 const walletAddress='11111111111111111111111111111112',draft={asset:'SOL',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'};let writes=0;
 const handler=createHandler({env:{UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test-only-token'},limit:async()=>{},
  prepare:async()=>({stage:'MANUAL_PERPS_REVIEW_VALIDATED',readyForSigning:false,tradingEnabled:false}),command:async()=>{writes++;return 'OK';},diagnostic:()=>{}});
 const response=await handler(new Request('https://www.jamddmaj.com/api/perps-signing-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({walletAddress,draft})}));
 assert.equal(response.status,502);assert.equal(writes,0);assert.equal(Object.hasOwn(await response.json(),'packet'),false);
});
