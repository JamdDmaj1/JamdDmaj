import test from 'node:test';
import assert from 'node:assert/strict';
import {setupPerpsControlPanel} from '../lib/perps-control-panel.js';
import {validateAutomationSettings} from '../lib/automation-panel.js';
import {quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';
const settings={capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3,stopLossPercent:null,takeProfitPercent:null,reductionPercent:50,lossAction:'disable'};
const state={walletAddress:'exclusive-public-wallet',revision:'server-revision',settings,enabled:false,paused:true};
test('a missing production fee service is explained and cannot be solved by adding collateral',async()=>{
 let reviews=0;const f=fixture({readStatus:async()=>({controls:state,recovery:{backupVerified:true},executionAvailable:true,feeStatus:null}),prepareActivation:async()=>{reviews++;throw Error();}});
 await f.connect.onclick();assert.match(f.status.textContent,/comisiones de producción/);assert.match(f.status.textContent,/aunque tengas más de 10 USDC/);assert.equal(f.prepareActivation.disabled,true);assert.equal(reviews,0);
});
function fixture(client){
 const node=()=>({children:[],append(...values){this.children.push(...values);},setAttribute(){}}),doc={createElement:node};
 const fields=Object.fromEntries(Object.entries(settings).map(([key,value])=>[key,{value:value??''}]));
 const result=setupPerpsControlPanel({panel:node(),fields,client,validateSettings:validateAutomationSettings,language:'es',doc});return {...result,fields};
}
test('missing browser session and rejected server session have distinct safe diagnostic codes',async()=>{
 for(const [code,message]of [['session-missing','SESSION_MISSING'],['login-required','SESSION_REJECTED'],['session-changed','sesión cambió']]){
  const f=fixture({read:async()=>{throw Object.assign(Error('private credentials'),{code});}});
  await f.connect.onclick();assert.ok(f.status.textContent.includes(message));assert.equal(f.save.disabled,true);assert.equal(f.activate.disabled,true);
  assert.equal(f.identity.textContent,'');assert.doesNotMatch(f.status.textContent,/private credentials/);
 }
});

test('server controls connect only on explicit click and saving or pausing never invokes activation',async()=>{
 const actions=[],f=fixture({read:async()=>{actions.push('read');return state;},save:async input=>{actions.push(input);return state;},pause:async input=>{actions.push(input);return state;}});
 assert.equal(actions.length,0);assert.equal(f.save.disabled,true);await f.connect.onclick();assert.equal(f.save.disabled,false);
 await f.save.onclick();await f.pause.onclick();assert.equal(actions[0],'read');assert.equal(actions[1].expectedRevision,'server-revision');assert.equal(actions[1].settings.margin,20);
 assert.deepEqual(actions[2],{walletAddress:'exclusive-public-wallet'});assert.match(f.status.textContent,/no la activa/);
});

test('exclusive bot funds show exact token amounts separately from main wallet and disappear after failed refresh or changed limits',async()=>{
 let fail=false;const f=fixture({readStatus:async()=>{if(fail)throw Error('private');return {controls:state,recovery:{backupVerified:true},funding:{stage:'OBSERVED_EXCLUSIVE_WALLET_FUNDS',
  availableUsdcUnits:'5141387',payerLamports:'144669689',configuredMarginUsdcUnits:'20000000',hasConfiguredCollateral:false}};},save:async()=>state});
 await f.connect.onclick();assert.match(f.funds.textContent,/5\.141387 USDC/);assert.match(f.funds.textContent,/0\.144669689 SOL/);
 assert.match(f.funds.textContent,/no cubre el margen/);assert.match(f.funds.textContent,/No deposites/);
 await f.save.onclick();assert.equal(f.funds.textContent,'');
 await f.connect.onclick();fail=true;await f.connect.onclick();assert.equal(f.funds.textContent,'');
 const unknown=fixture({readStatus:async()=>({controls:state,funding:null})});await unknown.connect.onclick();assert.match(unknown.funds.textContent,/no verificado/);
 assert.doesNotMatch(unknown.funds.textContent,/0 USDC/);
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

test('24/7 activation is an explicit review and separate unchecked consent, never a load/save side effect',async()=>{
 const calls=[],review={walletAddress:state.walletAddress,revision:state.revision,settings,expiresAt:Date.now()+60000};
 const f=fixture({readStatus:async()=>({controls:state,recovery:{backupVerified:true},executionAvailable:true}),
  prepareActivation:async args=>{calls.push(['review',args]);return review;},activate:async args=>{calls.push(['activate',args]);return {...state,enabled:true,paused:false,revision:'new-revision'};}});
 assert.equal(calls.length,0);assert.equal(f.prepareActivation.disabled,true);await f.connect.onclick();assert.equal(f.prepareActivation.disabled,false);assert.equal(calls.length,0);
 await f.prepareActivation.onclick();assert.equal(f.activate.disabled,true);assert.equal(f.activationConsent.checked,false);assert.match(f.activationSummary.textContent,/100 USDC/);assert.match(f.activationSummary.textContent,/Telegram/);
 f.activationConsent.checked=true;f.activationConsent.onchange();assert.equal(f.activate.disabled,false);await f.activate.onclick();
 assert.deepEqual(calls.map(c=>c[0]),['review','activate']);assert.equal(calls[1][1].review,review);assert.equal(calls[1][1].explicitApproval,true);assert.match(f.status.textContent,/automatización activa/);assert.equal(f.activationConsent.checked,false);
});

test('missing execution/backup, changed limits or lost activation acknowledgement never invent a running bot',async()=>{
 for(const available of [false,true]){
  const f=fixture({readStatus:async()=>({controls:state,recovery:{backupVerified:!available},executionAvailable:available}),prepareActivation:async()=>{throw Error('must not review');}});
  await f.connect.onclick();assert.equal(f.prepareActivation.disabled,true);
 }
 const review={walletAddress:state.walletAddress,revision:state.revision,settings,expiresAt:Date.now()+60000};let writes=0;
 const f=fixture({readStatus:async()=>({controls:state,recovery:{backupVerified:true},executionAvailable:true}),prepareActivation:async()=>review,
  activate:async()=>{writes++;throw Error('lost');}});
 await f.connect.onclick();await f.prepareActivation.onclick();f.fields.margin.value='25';f.activationConsent.checked=true;await f.activate.onclick();assert.equal(writes,0);assert.equal(f.activate.disabled,true);
 f.fields.margin.value='20';await f.connect.onclick();await f.prepareActivation.onclick();f.activationConsent.checked=true;await f.activate.onclick();assert.equal(writes,1);assert.match(f.status.textContent,/Activación sin confirmar/);assert.equal(f.prepareActivation.disabled,true);
});
test('custom limits remain adjustable and activation review stays available after saving or disabling',async()=>{
 let stored={...state},activations=0;const f=fixture({readStatus:async()=>({controls:stored,recovery:{backupVerified:true},executionAvailable:true}),
  save:async input=>{stored={...stored,settings:input.settings,revision:'saved-revision',enabled:false,paused:true};return stored;},
  pause:async()=>{stored={...stored,revision:'paused-revision',enabled:false,paused:true};return stored;},
  prepareActivation:async()=>({...stored,expiresAt:Date.now()+60000}),activate:async()=>{activations++;return {...stored,enabled:true,paused:false};}});
 await f.connect.onclick();f.fields.margin.value='15';f.fields.dailyTrades.value='7';await f.save.onclick();
 assert.equal(stored.settings.margin,15);assert.equal(stored.settings.dailyTrades,7);assert.equal(f.prepareActivation.disabled,false);assert.equal(activations,0);
 await f.prepareActivation.onclick();assert.match(f.activationSummary.textContent,/15 USDC/);assert.match(f.activationSummary.textContent,/7/);assert.equal(f.activate.disabled,true);
 await f.pause.onclick();assert.equal(f.prepareActivation.disabled,false);assert.equal(f.activationConsent.checked,false);assert.equal(activations,0);
});
test('readiness after saving must match the same wallet and revision before re-enabling activation',async()=>{
 let reads=0;const f=fixture({readStatus:async()=>({controls:++reads===1?state:{...state,revision:'foreign-new-revision'},recovery:{backupVerified:true},executionAvailable:true}),save:async()=>state});
 await f.connect.onclick();await f.save.onclick();assert.equal(f.prepareActivation.disabled,true);assert.match(f.status.textContent,/configuración cambió/);
});
test('bot activation fee consent is separate, priced on margin and cleared after use',async()=>{
 let calls=0;const f=fixture({readStatus:async()=>({controls:state,recovery:{backupVerified:true},executionAvailable:true}),
  prepareActivation:async()=>({...state,platformFee:quotePerpsPlatformFee('20000000'),expiresAt:Date.now()+60000}),
  activate:async args=>{calls++;assert.equal(args.explicitFeeApproval,true);return {...state,enabled:true,paused:false};}});
 await f.connect.onclick();await f.prepareActivation.onclick();assert.equal(f.feeConsent.checked,false);assert.match(f.feeSummary.textContent,/0\.04 USDC/);assert.match(f.feeSummary.textContent,/20\.04 USDC/);
 f.activationConsent.checked=true;f.activationConsent.onchange();assert.equal(f.activate.disabled,true);await f.activate.onclick();assert.equal(calls,0);
 await f.connect.onclick();await f.prepareActivation.onclick();f.activationConsent.checked=true;f.feeConsent.checked=true;f.feeConsent.onchange();assert.equal(f.activate.disabled,false);
 await f.activate.onclick();assert.equal(calls,1);assert.equal(f.feeConsent.checked,false);
});
