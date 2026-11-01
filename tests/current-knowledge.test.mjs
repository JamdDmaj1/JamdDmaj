import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {knowledgeLookupPlan,knowledgeCapabilityReply} from '../lib/current-knowledge.js';
const now=new Date('2026-10-31T12:00:00Z');
test('current office holders trigger a lookup without requiring the word current',()=>{
 const p=knowledgeLookupPlan('quien es el presidente de Estados Unidos?',[],now);
 assert.equal(p.needsLookup,true);assert.match(p.query,/2026-10-31/);
 assert.equal(knowledgeLookupPlan('quien es el presidente?',[],now).kind,'clarify-country');
 const follow=knowledgeLookupPlan('entonces quien es el presidente?',[{role:'user',content:'hablo de Colombia, correo privado no reenviar'}],now);
 assert.match(follow.query,/Colombia/);assert.doesNotMatch(follow.query,/correo|privado/);
});
test('capability answers distinguish retrieval, consented memory and training, without a fake cutoff',()=>{
 for(const q of ['y puedes aprender?','cuando fue tu ultima actualizacion?','can you learn?'])assert.equal(knowledgeLookupPlan(q).kind,'capabilities');
 assert.match(knowledgeCapabilityReply('es'),/no reentrena/);assert.match(knowledgeCapabilityReply('es'),/solo debo afirmar/);
});
test('ordinary and historical questions do not falsely claim live lookup; sensitive queries are not sent',()=>{
 assert.equal(knowledgeLookupPlan('cuanto es 2 mas 2').needsLookup,false);
 assert.equal(knowledgeLookupPlan('presidente de Estados Unidos en 1998').needsLookup,false);
 for(const q of ['busca mi PASSWORD secreta','busca mi correo test@example.com','precio 4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr']){
  const p=knowledgeLookupPlan(q);assert.equal(p.kind,'private-query');assert.equal(p.query,'');
 }
});
test('source context is bounded as untrusted and failure cannot be presented as verified',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),live=await readFile(new URL('../api/live.js',import.meta.url),'utf8');
 assert.match(html,/knowledgeLookupPlan\(currentUserRequest,chat.messages\)/);
 assert.doesNotMatch(html,/Verified free live data supplied by the app/);
 assert.match(html,/returned no usable evidence/);
 assert.match(live,/BEGIN_UNTRUSTED_SOURCE_DATA/);assert.match(live,/destination.protocol==='https:'/);
});
