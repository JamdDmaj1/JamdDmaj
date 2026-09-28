import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaSwapBuildService } from '../lib/solana-swap-build.js';
const sol='So11111111111111111111111111111111111111112', usdc='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const taker='11111111111111111111111111111111'; // disposable fixture, never a real trade
const request={inputMint:sol,outputMint:usdc,amount:'10000000',taker,slippageBps:50};
function body(){return {inputMint:sol,outputMint:usdc,inAmount:'10000000',outAmount:'1000000',otherAmountThreshold:'995000',swapMode:'ExactIn',slippageBps:50,
  computeBudgetInstructions:[],setupInstructions:[],otherInstructions:[],swapInstruction:{programId:sol,data:'AA==',accounts:[{pubkey:taker,isSigner:true,isWritable:true}]},
  cleanupInstruction:null,tipInstruction:null,addressesByLookupTableAddress:{[sol]:['untrusted-provider-address']},
  blockhashWithMetadata:{blockhash:Array(32).fill(1),lastValidBlockHeight:100}};}
function service(value){return createSolanaSwapBuildService({apiKey:'fixture',fetchImpl:async()=>Response.json(value),now:()=>100});}
test('prepares bounded instructions without signing or trusting resolved provider accounts',async()=>{
  let calls=0;
  const build=createSolanaSwapBuildService({apiKey:'fixture',fetchImpl:async(url,options)=>{
    calls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
    const target=new URL(url);assert.equal(target.pathname,'/swap/v2/build');assert.equal(target.searchParams.get('taker'),taker);
    assert.equal(target.searchParams.has('tipAmount'),false);return Response.json(body());},now:()=>100});
  const result=await build(request);assert.equal(calls,1);assert.equal(result.executable,false);assert.equal(result.requiresNativeValidation,true);
  assert.deepEqual(result.lookupTableAddresses,[sol]);assert.equal(result.addressesByLookupTableAddress,undefined);
  assert.equal(result.minimumOut,'995000');assert.ok(Object.isFrozen(result.instructions[0].accounts[0]));
});
test('rejects mismatched amounts thresholds slippage tips and executable responses',async()=>{
  for(const delta of [{inAmount:'1'},{outputMint:sol},{slippageBps:100},{swapMode:'ExactOut'},{otherAmountThreshold:'994999'},
    {otherAmountThreshold:'1000001'},{tipInstruction:{}},{transaction:'payload'},{errorCode:1}]) await assert.rejects(service({...body(),...delta})(request));
});
test('rejects malformed instructions additional signers and unknown block lifetime',async()=>{
  for(const edit of [b=>b.swapInstruction.accounts[0].pubkey=usdc,b=>b.swapInstruction.accounts[0].isSigner='true',b=>b.swapInstruction.data='%%',
    b=>b.blockhashWithMetadata.lastValidBlockHeight=Number.MAX_SAFE_INTEGER+1,b=>b.blockhashWithMetadata.blockhash[0]=256,
    b=>b.computeBudgetInstructions=null,b=>b.addressesByLookupTableAddress=[]]){const value=body();edit(value);await assert.rejects(service(value)(request));}
});
test('minimum output rounds upward to preserve the requested slippage bound',async()=>{
  await assert.rejects(service({...body(),outAmount:'1000001',otherAmountThreshold:'995000'})(request));
  assert.equal((await service({...body(),outAmount:'1000001',otherAmountThreshold:'995001'})(request)).minimumOut,'995001');
});
test('invalid input never reaches provider and redirects are not followed',async()=>{
  const build=createSolanaSwapBuildService({apiKey:'fixture',fetchImpl:()=>assert.fail('unexpected network')});
  for(const delta of [{amount:'0'},{amount:'1e6'},{slippageBps:0},{slippageBps:501},{slippageBps:'50'},{taker:'bad'}])await assert.rejects(build({...request,...delta}));
  await assert.rejects(createSolanaSwapBuildService({apiKey:'fixture',fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://untrusted.invalid'}})})(request));
});
