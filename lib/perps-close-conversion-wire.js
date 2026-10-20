// Protected second-leg wire construction only, not a signing grant. Actual
// finalized proceeds, fresh balances/prices, exact-wire simulation, durable
// accounting and explicit authorization remain mandatory caller boundaries.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,requireDecodedServerPerpsCustody,deriveServerPerpsIdentities} from './perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
const U64=18446744073709551615n,proofs=new WeakMap();
function fail(){throw Error('INVALID_PERPS_CLOSE_CONVERSION_WIRE');}
function address(s){try{if(typeof s!=='string'||bs58.decode(s).length!==32||bs58.encode(bs58.decode(s))!==s)fail();return s;}catch{fail();}}
function units(s){if(typeof s!=='string'||!/^[1-9][0-9]{0,19}$/.test(s)||BigInt(s)>U64)fail();return BigInt(s);}
const associated=async(owner,mint)=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
export function readConstructedPerpsCloseConversionWire(value){const proof=proofs.get(value);if(!proof)fail();return proof;}
// Inputs must be independent fresh oracle bounds: a lower USD price for the
// sold asset and an upper USD price for USDC. This pure rounding helper does
// not authenticate an oracle or treat USDC as unconditionally worth one dollar.
export function minimumPerpsConversionUsdcUnits({amountUnits,inputDecimals,inputPriceLowerUsdUnits,usdcPriceUpperUsdUnits,maxSlippageBps}={}){
 if(!Number.isInteger(inputDecimals)||inputDecimals<0||inputDecimals>18||!Number.isInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100)fail();
 const amount=units(amountUnits),input=units(inputPriceLowerUsdUnits),usdc=units(usdcPriceUpperUsdUnits);
 const numerator=amount*input*1000000n*BigInt(10000-maxSlippageBps),denominator=10n**BigInt(inputDecimals)*usdc*10000n;
 const out=(numerator+denominator-1n)/denominator;if(out<=0n||out>U64)fail();return out.toString();
}
export async function buildUnsignedPerpsCloseConversionWire(input,collateral,usdc){
 requireDecodedServerPerpsCustody(collateral);requireDecodedServerPerpsCustody(usdc);
 input=structuredClone(input);
 const {walletAddress:wallet,asset,nativeSolInput,closeWrappedAccount,blockhash}=input;
 address(wallet);address(blockhash);
 if(!['BTC','ETH','SOL'].includes(asset)||collateral.asset!==asset||usdc.asset!=='USDC'||!collateral.allowSwap||!usdc.allowSwap
  ||typeof nativeSolInput!=='boolean'||typeof closeWrappedAccount!=='boolean'||nativeSolInput&&asset!=='SOL'||closeWrappedAccount&&!nativeSolInput)fail();
 const amount=units(input.amountUnits),minimum=units(input.minimumUsdcUnits),price=input.computeUnitPriceMicroLamports??1000;
 const lastValidBlockHeight=units(input.lastValidBlockHeight);
 if(!Number.isSafeInteger(price)||price<0||price>10000)fail();
 const source=await associated(wallet,collateral.mint),destination=await associated(wallet,usdc.mint);
 const ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset,side:'LONG'});
 const instructions=[],add=(program,accounts,data)=>instructions.push({program,accounts,data});
 const budget=Buffer.alloc(5);budget[0]=2;budget.writeUInt32LE(400000,1);add(COMPUTE,[],budget);
 const priority=Buffer.alloc(9);priority[0]=3;priority.writeBigUInt64LE(BigInt(price),1);add(COMPUTE,[],priority);
 if(nativeSolInput)add(ATA,[wallet,source,wallet,collateral.mint,SYSTEM,TOKEN],Buffer.from([1]));
 add(ATA,[wallet,destination,wallet,usdc.mint,SYSTEM,TOKEN],Buffer.from([1]));
 if(nativeSolInput){
  const transfer=Buffer.alloc(12);transfer.writeUInt32LE(2);transfer.writeBigUInt64LE(amount,4);add(SYSTEM,[wallet,source],transfer);add(TOKEN,[source],Buffer.from([17]));
 }
 const swap=Buffer.alloc(24);Buffer.from('414b3f4ceb5b5b88','hex').copy(swap);swap.writeBigUInt64LE(amount,8);swap.writeBigUInt64LE(minimum,16);
 const roles=[wallet,source,destination,ids.transferAuthority,ids.perpetuals,PERPS_POOL,
  collateral.address,collateral.dovesAgOracle,collateral.dovesAgOracle,collateral.tokenAccount,
  usdc.address,usdc.dovesAgOracle,usdc.dovesAgOracle,usdc.tokenAccount,TOKEN,ids.eventAuthority,PERPS_PROGRAM];
 add(PERPS_PROGRAM,roles,swap);
 if(closeWrappedAccount)add(TOKEN,[source,wallet,wallet],Buffer.from([9]));
 const writes=[...new Set([wallet,source,destination,PERPS_POOL,collateral.address,collateral.tokenAccount,usdc.address,usdc.tokenAccount])];
 const reads=[...new Set(instructions.flatMap(i=>[i.program,...i.accounts]).filter(k=>!writes.includes(k)))],keys=[...writes,...reads];
 // This fixed path uses no address lookup tables, additional signers, ledger,
 // arbitrary routes, provider-resolved accounts, tips or replacement blockhash.
 if(keys.length>=128||new Set(keys).size!==keys.length||instructions.length>=128||keys[0]!==wallet)fail();
 const compiled=instructions.map(i=>{
  if(i.data.length>=128||i.accounts.length>=128||!reads.includes(i.program))fail();
  return Buffer.concat([Buffer.from([keys.indexOf(i.program),i.accounts.length,...i.accounts.map(k=>keys.indexOf(k)),i.data.length]),i.data]);
 });
 const message=Buffer.concat([Buffer.from([1,0,reads.length,keys.length]),...keys.map(k=>Buffer.from(bs58.decode(k))),Buffer.from(bs58.decode(blockhash)),Buffer.from([compiled.length]),...compiled]);
 const wire=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),message]);if(wire.length>1232)fail();
 const result=Object.freeze({stage:'PROTECTED_CLOSE_CONVERSION_WIRE_ONLY',readyForSigning:false,tradingEnabled:false,
  walletAddress:wallet,asset,source,destination,amountUnits:amount.toString(),minimumUsdcUnits:minimum.toString(),nativeSolInput,closeWrappedAccount,blockhash,
  computeUnitLimit:400000,computeUnitPriceMicroLamports:price,
  lastValidBlockHeight:lastValidBlockHeight.toString(),
  serializedTxBase64:wire.toString('base64'),messageBase64:message.toString('base64'),
  requiresFinalizedProceedsAndJournalBinding:true,requiresFreshOracleAndFundingPolicy:true,requiresSameWireSimulation:true,requiresExplicitAuthorization:true});
 proofs.set(result,Object.freeze({collateral,usdc}));return result;
}
