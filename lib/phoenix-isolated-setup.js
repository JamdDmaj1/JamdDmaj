// Same-wallet isolated account setup only. No delegated key, deposit, trade,
// signature or broadcast. Parent policy is protected before permissionless sync.
import {buildRegisterTraderIx,buildSyncParentToChildIx,buildUpdateTraderPreferenceBitsIx,TraderPreferenceToggleTarget} from '@ellipsis-labs/rise';
import {requirePhoenixUnsignedPlan,PHOENIX_IDENTITIES as ID} from './phoenix-market-plan.js';
import {derivePhoenixWalletAccounts} from './phoenix-instruction-bindings.js';
import {requireFreshPhoenixChainAccount} from './phoenix-chain-account.js';
import {requireFreshPhoenixNativeMarket} from './phoenix-native-market.js';
const setups=new WeakMap();
const fail=code=>{throw Error('PHOENIX_SETUP_'+code);};
const exposure=p=>BigInt(p.baseLots)!==0n||BigInt(p.virtualQuoteLots)!==0n;
const immutable=ix=>Object.freeze({programAddress:ix.programAddress,
 accounts:Object.freeze(ix.accounts.map(a=>Object.freeze({address:a.address,role:a.role}))),data:Object.freeze([...ix.data])});

export async function buildPhoenixIsolatedSetup({plan,native,account}={}, {request,now=Date.now}={}){
 requirePhoenixUnsignedPlan(plan);
 if(typeof request!=='function'||typeof now!=='function')fail('INPUT');
 const current=()=>{
  requireFreshPhoenixNativeMarket(native,{plan,request});
  requireFreshPhoenixChainAccount(account,{walletAddress:plan.walletAddress,request,minimumSlot:plan.observedSlot});
  const at=now();if(!Number.isSafeInteger(at)||at<account.observedAt||at>=plan.expiresAt)fail('EXPIRED');
 };
 current();
 if(plan.isolatedSubaccountIndex>100)fail('SUBACCOUNT_RANGE');
 const parent=account.subaccounts.find(s=>s.subaccountIndex===0),child=account.subaccounts.find(s=>s.subaccountIndex===plan.isolatedSubaccountIndex);
 if(!parent?.exists)fail('PARENT_ONBOARDING_REQUIRED');
 if(!parent.authorityIsWallet||!child)fail('AUTHORITY');
 if(!parent.disableCollateralSweep&&(parent.positions.some(exposure)||parent.quoteCollateralUnits!=='0'||parent.spotCollateralCount||parent.hasLockedDeposit))fail('PARENT_UNMANAGED');
 if(child.exists&&(!child.authorityIsWallet||child.hasSplineLiquidity||child.spotCollateralCount||child.hasLockedDeposit))fail('AUTHORITY');
 const a=await derivePhoenixWalletAccounts(plan.walletAddress,plan.isolatedSubaccountIndex);
 if(child.address!==a.trader)fail('AUTHORITY');
 const protocol={programAddress:ID.program,logAuthorityAddress:'GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS',globalConfigurationAddress:native.exchangeKeys.globalConfig};
 const protect=address=>buildUpdateTraderPreferenceBitsIx({...protocol,traderWallet:plan.walletAddress,traderAccount:address,
  toggles:[{target:TraderPreferenceToggleTarget.CollateralSweep,set:false}]});
 const instructions=[];
 // Sync is permissionless and copies these preferences. Protecting only the
 // child would let a later ordinary sync silently restore automatic sweep.
 if(!parent.disableCollateralSweep)instructions.push(protect(parent.address));
 if(!child.exists){
  instructions.push(buildRegisterTraderIx({...protocol,payer:plan.walletAddress,trader:plan.walletAddress,traderAccount:a.trader,
   maxPositions:1n,disableCollateralSweep:true,traderPdaIndex:0,traderSubaccountIndex:plan.isolatedSubaccountIndex}));
  instructions.push(buildSyncParentToChildIx({...protocol,traderWallet:plan.walletAddress,parentTraderAccount:parent.address,
   childTraderAccount:a.trader,globalTraderIndex:native.exchangeKeys.globalTraderIndex}));
  instructions.push(protect(a.trader));
 }else if(!child.disableCollateralSweep)instructions.push(protect(a.trader));
 current();
 const result=Object.freeze({stage:'PHOENIX_ISOLATED_SETUP_UNSIGNED',readyForSigning:false,walletAddress:plan.walletAddress,
  subaccountIndex:plan.isolatedSubaccountIndex,traderAddress:a.trader,parentAddress:parent.address,
  createsAccount:!child.exists,accountDataBytes:child.exists?0:280,
  changesParentSettlementPolicy:!parent.disableCollateralSweep,instructions:Object.freeze(instructions.map(immutable)),
  expiresAt:Math.min(plan.expiresAt,account.observedAt+10000),requiresSameWireSimulation:true,requiresDurableOwnerConsent:true});
 setups.set(result,{plan,native,account,request,now});return result;
}

export function requirePhoenixIsolatedSetup(value){
 const p=setups.get(value);if(!p)fail('UNVERIFIED');
 requireFreshPhoenixNativeMarket(p.native,{plan:p.plan,request:p.request});
 requireFreshPhoenixChainAccount(p.account,{walletAddress:value.walletAddress,request:p.request});
 if(p.now()>=value.expiresAt)fail('EXPIRED');
 return Object.freeze({...p,setup:value});
}
