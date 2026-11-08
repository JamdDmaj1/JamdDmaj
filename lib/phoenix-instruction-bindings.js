// Independent account ordering/role and data checks. This is a preflight check,
// NOT proof of on-chain account state, a wire policy or custody authorization.
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {getProgramDerivedAddress} from '@solana/kit';
import {getPlaceMarketOrderEncoder,getDepositFundsEncoder,getEmberDepositEncoder} from '@ellipsis-labs/rise';
import {PHOENIX_IDENTITIES,phoenixKey,requirePhoenixUnsignedPlan} from './phoenix-market-plan.js';

const PROGRAM=PHOENIX_IDENTITIES.program;
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM='11111111111111111111111111111111';
const LOG='GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS';
const GLOBAL='2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ';
const fail=()=>{throw Error('PHOENIX_INSTRUCTION_BINDING');};
const bytes=value=>bs58.decode(value);
const derive=async(programAddress,seeds)=>(await getProgramDerivedAddress({programAddress,seeds}))[0];
const meta=(address,role=0)=>({address,role});

export function phoenixExchangeKeyFingerprint(keys){
  if(!keys)fail();
  const fields={};
  for(const name of ['globalConfig','canonicalMint','globalVault','perpAssetMap','withdrawQueue'])fields[name]=phoenixKey(keys[name]);
  for(const name of ['globalTraderIndex','activeTraderBuffer']){
    if(!Array.isArray(keys[name])||keys[name].length<1||keys[name].length>16)fail();
    fields[name]=Array.from(keys[name],phoenixKey);
  }
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

export async function derivePhoenixWalletAccounts(wallet,subaccountIndex){
  phoenixKey(wallet);
  if(!Number.isInteger(subaccountIndex)||subaccountIndex<1||subaccountIndex>255)fail();
  const [trader,usdcAta,canonicalAta,globalVault,emberState,emberVault]=await Promise.all([
    derive(PROGRAM,['trader',bytes(wallet),new Uint8Array([0]),new Uint8Array([subaccountIndex])]),
    derive(ATA,[bytes(wallet),bytes(TOKEN),bytes(PHOENIX_IDENTITIES.usdc)]),
    derive(ATA,[bytes(wallet),bytes(TOKEN),bytes(PHOENIX_IDENTITIES.canonicalUsdc)]),
    derive(PROGRAM,['vault',bytes(PHOENIX_IDENTITIES.canonicalUsdc)]),
    derive(PHOENIX_IDENTITIES.ember,[bytes(PROGRAM),'state']),
    derive(PHOENIX_IDENTITIES.ember,[bytes(PROGRAM),'vault'])
  ]);
  return Object.freeze({trader,usdcAta,canonicalAta,globalVault,emberState,emberVault});
}

function check(ix,program,accounts,data){
  if(ix?.programAddress!==program||!Array.isArray(ix.accounts)||ix.accounts.length!==accounts.length||
     !(ix.data instanceof Uint8Array)||ix.data.length!==data.length)fail();
  for(let i=0;i<accounts.length;i++)if(ix.accounts[i]?.address!==accounts[i].address||ix.accounts[i]?.role!==accounts[i].role)fail();
  for(let i=0;i<data.length;i++)if(ix.data[i]!==data[i])fail();
  // Copy, then deeply freeze plain numeric data so later SDK mutation cannot
  // change the evidence. This snapshot is still deliberately not signable.
  return Object.freeze({programAddress:program,
    accounts:Object.freeze(accounts.map(a=>Object.freeze({...a}))),data:Object.freeze([...data])});
}

export async function inspectPhoenixInstructionBindings(plan,pieces,{exchangeKeys,now=Date.now}={}){
  requirePhoenixUnsignedPlan(plan);
  if(now()>=plan.expiresAt)fail();
  const keys=exchangeKeys&&{...exchangeKeys,
    globalTraderIndex:Array.isArray(exchangeKeys.globalTraderIndex)?[...exchangeKeys.globalTraderIndex]:null,
    activeTraderBuffer:Array.isArray(exchangeKeys.activeTraderBuffer)?[...exchangeKeys.activeTraderBuffer]:null};
  if(!keys||keys.globalConfig!==GLOBAL||keys.canonicalMint!==PHOENIX_IDENTITIES.canonicalUsdc)fail();
  for(const k of ['perpAssetMap','globalVault','withdrawQueue'])phoenixKey(keys[k]);
  for(const group of [keys.globalTraderIndex,keys.activeTraderBuffer]){
    if(!Array.isArray(group)||group.length<1||group.length>16||new Set(group).size!==group.length)fail();
    group.forEach(phoenixKey);
  }
  const addresses=await derivePhoenixWalletAccounts(plan.walletAddress,plan.isolatedSubaccountIndex);
  if(now()>=plan.expiresAt)fail();
  if(keys.globalVault!==addresses.globalVault||pieces?.walletAddress!==plan.walletAddress||pieces.close!==plan.close||
     !Array.isArray(pieces.instructions)||pieces.instructions.length!==(plan.close?1:4))fail();
  const arena=[...keys.globalTraderIndex,...keys.activeTraderBuffer].map(a=>meta(a,1));
  const mutableNative=[keys.perpAssetMap,...arena.map(a=>a.address),plan.market.market,plan.market.spline];
  const reserved=new Set([PROGRAM,LOG,GLOBAL,TOKEN,ATA,SYSTEM,PHOENIX_IDENTITIES.ember,
    PHOENIX_IDENTITIES.usdc,PHOENIX_IDENTITIES.canonicalUsdc,plan.walletAddress,...Object.values(addresses)]);
  if(new Set(mutableNative).size!==mutableNative.length||mutableNative.some(a=>reserved.has(a)))fail();
  const orderAccounts=[meta(PROGRAM),meta(LOG),meta(GLOBAL,1),meta(plan.walletAddress,2),
    meta(addresses.trader,1),meta(keys.perpAssetMap,1),...arena,meta(plan.market.market,1),meta(plan.market.spline,1)];
  const checked=[];
  if(!plan.close){
    const {walletAddress:wallet}=plan,amount=BigInt(plan.marginUsdcUnits);
    checked.push(check(pieces.instructions[0],ATA,[meta(wallet,3),meta(addresses.canonicalAta,1),meta(wallet),meta(PHOENIX_IDENTITIES.canonicalUsdc),meta(SYSTEM),meta(TOKEN)],new Uint8Array([1])));
    checked.push(check(pieces.instructions[1],PHOENIX_IDENTITIES.ember,[meta(wallet,2),meta(addresses.emberState),meta(PHOENIX_IDENTITIES.usdc),meta(PHOENIX_IDENTITIES.canonicalUsdc,1),meta(addresses.usdcAta,1),meta(addresses.canonicalAta,1),meta(addresses.emberVault,1),meta(TOKEN)],getEmberDepositEncoder().encode(amount)));
    checked.push(check(pieces.instructions[2],PROGRAM,[meta(PROGRAM),meta(LOG),meta(GLOBAL,1),meta(wallet,2),meta(addresses.canonicalAta,1),meta(addresses.trader,1),meta(addresses.globalVault,1),meta(TOKEN),...arena],getDepositFundsEncoder().encode(amount)));
  }
  checked.push(check(pieces.instructions.at(-1),PROGRAM,orderAccounts,getPlaceMarketOrderEncoder().encode(plan.packet)));
  return Object.freeze({stage:'PHOENIX_BOUND_UNSIGNED_INSTRUCTIONS',readyForSigning:false,
    addresses,instructions:Object.freeze(checked),exchangeKeyFingerprint:phoenixExchangeKeyFingerprint(keys),requiresOnchainAccountEvidence:true,
    requiresSameWireSimulation:true,requiresDurableOwnerConsent:true});
}
