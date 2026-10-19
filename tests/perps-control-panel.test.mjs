import test from 'node:test';
import assert from 'node:assert/strict';
import {setupPerpsControlPanel} from '../lib/perps-control-panel.js';
import {validateAutomationSettings} from '../lib/automation-panel.js';
const settings={capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3,stopLossPercent:null,takeProfitPercent:null,reductionPercent:50,lossAction:'disable'};
const state={walletAddress:'exclusive-public-wallet',revision:'server-revision',settings,enabled:false,paused:true};
function fixture(client){
 const node=()=>({children:[],append(...values){this.children.push(...values);},setAttribute(){}}),doc={createElement:node};
 const fields=Object.fromEntries(Object.entries(settings).map(([key,value])=>[key,{value:value??''}]));
 const result=setupPerpsControlPanel({panel:node(),fields,client,validateSettings:validateAutomationSettings,language:'es',doc});return {...result,fields};
}
test('server controls connect only on explicit click and saving or pausing never invokes activation',async()=>{
 const actions=[],f=fixture({read:async()=>{actions.push('read');return state;},save:async input=>{actions.push(input);return state;},pause:async input=>{actions.push(input);return state;}});
 assert.equal(actions.length,0);assert.equal(f.save.disabled,true);await f.connect.onclick();assert.equal(f.save.disabled,false);
 await f.save.onclick();await f.pause.onclick();assert.equal(actions[0],'read');assert.equal(actions[1].expectedRevision,'server-revision');assert.equal(actions[1].settings.margin,20);
 assert.deepEqual(actions[2],{walletAddress:'exclusive-public-wallet'});assert.match(f.status.textContent,/no la activa/);
});
test('missing exclusive wallet, connection failures and uncertain pause do not show a funded or stopped bot',async()=>{
 const empty=fixture({read:async()=>null});await empty.connect.onclick();assert.equal(empty.save.disabled,true);assert.match(empty.status.textContent,/aún no tiene/);
 const failed=fixture({read:async()=>state,pause:async()=>{throw Error('private detail');}});await failed.connect.onclick();await failed.pause.onclick();
 assert.match(failed.status.textContent,/No se confirmó la pausa/);assert.equal(failed.save.disabled,true);assert.equal(failed.identity.textContent,'');
});
test('refresh preserves edits typed while it is in flight and duplicate clicks do not overlap',async()=>{
 let finish,calls=0;const f=fixture({read:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const first=f.connect.onclick();await f.connect.onclick();assert.equal(calls,1);f.fields.margin.value='25';finish(state);await first;assert.equal(f.fields.margin.value,'25');
});

test('invalid draft values are explained locally without losing the confirmed account or making a server mutation',async()=>{
 let writes=0;const f=fixture({read:async()=>state,save:async()=>{writes++;return state;}});await f.connect.onclick();f.fields.margin.value='1000';
 await f.save.onclick();assert.equal(writes,0);assert.match(f.status.textContent,/Margen por trade/);assert.equal(f.save.disabled,false);
});

test('exclusive wallet setup needs an explicit empty-account read and unchecked-by-default custody consent',async()=>{
 const calls=[],f=fixture({read:async()=>null,provision:async args=>{calls.push(args);return {controls:state};}});
 assert.equal(f.provision.disabled,true);assert.equal(f.consent.checked,false);await f.provision.onclick();assert.equal(calls.length,0);
 await f.connect.onclick();assert.equal(f.provision.disabled,true);f.consent.checked=true;f.consent.onchange();assert.equal(f.provision.disabled,false);
 await f.provision.onclick();assert.equal(calls.length,1);assert.equal(calls[0].explicitCustodyApproval,true);assert.equal(f.provision.disabled,true);assert.equal(f.consent.checked,false);
 assert.match(f.status.textContent,/No deposites todavía/);assert.match(f.status.textContent,/respaldo/);assert.equal(f.save.disabled,false);
});

test('failed provisioning is treated as unconfirmed and must be read again before retrying',async()=>{
 const f=fixture({read:async()=>null,provision:async()=>{throw Error('private detail');}});await f.connect.onclick();f.consent.checked=true;f.consent.onchange();await f.provision.onclick();
 assert.equal(f.provision.disabled,true);assert.equal(f.save.disabled,true);assert.match(f.status.textContent,/No se pudo confirmar/);assert.doesNotMatch(f.status.textContent,/private/);
});

test('server recovery status explains verified backup separately from execution and is cleared on refresh failure',async()=>{
 let verified=true,fail=false,reads=0;const f=fixture({readStatus:async()=>{reads++;if(fail)throw Error('private');return {controls:state,recovery:{backupVerified:verified}};}});
 await f.connect.onclick();assert.equal(reads,1);assert.match(f.status.textContent,/Respaldo cifrado verificado/);assert.match(f.status.textContent,/No deposites todavía/);
 assert.match(f.status.textContent,/aún no está habilitada/);assert.equal(f.provision.disabled,true);
 verified=false;await f.connect.onclick();assert.match(f.status.textContent,/Falta verificar el respaldo/);
 fail=true;await f.connect.onclick();assert.equal(f.identity.textContent,'');assert.doesNotMatch(f.status.textContent,/Respaldo cifrado verificado/);assert.equal(f.save.disabled,true);
});
