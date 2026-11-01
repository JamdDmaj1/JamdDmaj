// Unsigned first leg for a collateral-funded Long. No signer or submission
// capability. A finalized receipt, fresh oracle/funding simulation, durable
// reservation and separate opening authorization are still required.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,requireDecodedServerPerpsCustody,deriveServerPerpsIdentities} from './perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
const proofs=new WeakMap(),MAX=18446744073709551615n;
function fail(){throw Error('INVALID_PERPS_ENTRY_CONVERSION_WIRE');}
function address(s){try{if(typeof s!=='string'||bs58.decode(s).length!==32||bs58.encode(bs58.decode(s))!==s)fail();return s;}catch{fail();}}
function units(s){if(typeof s!=='string'||!/^[1-9][0-9]{0,19}$/.test(s)||BigInt(s)>MAX)fail();return BigInt(s);}
const associated=async(owner,mint)=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
export function readConstructedPerpsEntryConversionWire(value){const proof=proofs.get(value);if(!proof)fail();return proof;}
export function minimumPerpsEntryCollateralUnits({usdcUnits,outputDecimals,usdcPriceLowerUsdUnits,outputPriceUpperUsdUnits,maxSlippageBps}={}){
 if(!Number.isInteger(outputDecimals)||outputDecimals<0||outputDecimals>18||maxSlippageBps!==50)fail();
 const amount=units(usdcUnits),input=units(usdcPriceLowerUsdUnits),output=units(outputPriceUpperUsdUnits);
 const numerator=amount*input*10n**BigInt(outputDecimals)*9950n,denominator=1000000n*output*10000n;
 const minimum=(numerator+denominator-1n)/denominator;if(minimum<=0n||minimum>MAX)fail();return minimum.toString();
}
export async function buildUnsignedPerpsEntryConversionWire(input,usdc,collateral){
 requireDecodedServerPerpsCustody(usdc);requireDecodedServerPerpsCustody(collateral);input=structuredClone(input);
 if(!input||Object.keys(input).some(k=>!['walletAddress','asset','blockhash','usdcUnits','minimumCollateralUnits','lastValidBlockHeight','computeUnitPriceMicroLamports'].includes(k)))fail();
 const {walletAddress:wallet,asset,blockhash}=input;address(wallet);address(blockhash);
 if(!['BTC','ETH','SOL'].includes(asset)||collateral.asset!==asset||usdc.asset!=='USDC'||!usdc.allowSwap||!collateral.allowSwap)fail();
 const amount=units(input.usdcUnits),minimum=units(input.minimumCollateralUnits),height=units(input.lastValidBlockHeight);
 const price=input.computeUnitPriceMicroLamports??1000;if(!Number.isSafeInteger(price)||price<0||price>10000)fail();
 const source=await associated(wallet,usdc.mint),destination=await associated(wallet,collateral.mint);
 const ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset,side:'LONG'}),instructions=[];
 const add=(program,accounts,data)=>instructions.push({program,accounts,data});
 const budget=Buffer.alloc(5);budget[0]=2;budget.writeUInt32LE(400000,1);add(COMPUTE,[],budget);
 const priority=Buffer.alloc(9);priority[0]=3;priority.writeBigUInt64LE(BigInt(price),1);add(COMPUTE,[],priority);
 add(ATA,[wallet,destination,wallet,collateral.mint,SYSTEM,TOKEN],Buffer.from([1]));
 const swap=Buffer.alloc(24);Buffer.from('414b3f4ceb5b5b88','hex').copy(swap);swap.writeBigUInt64LE(amount,8);swap.writeBigUInt64LE(minimum,16);
 add(PERPS_PROGRAM,[wallet,source,destination,ids.transferAuthority,ids.perpetuals,PERPS_POOL,
  usdc.address,usdc.dovesAgOracle,usdc.dovesAgOracle,usdc.tokenAccount,
  collateral.address,collateral.dovesAgOracle,collateral.dovesAgOracle,collateral.tokenAccount,TOKEN,ids.eventAuthority,PERPS_PROGRAM],swap);
 // Keep all received collateral, including WSOL, in its canonical ATA.
 // Never close/unwrap an existing account or include arbitrary provider routes.
 const writes=[...new Set([wallet,source,destination,PERPS_POOL,usdc.address,usdc.tokenAccount,collateral.address,collateral.tokenAccount])];
 const reads=[...new Set(instructions.flatMap(i=>[i.program,...i.accounts]).filter(k=>!writes.includes(k)))],keys=[...writes,...reads];
 if(keys.length>=128||keys[0]!==wallet)fail();
 const compiled=instructions.map(i=>{if(i.data.length>=128||i.accounts.length>=128||!reads.includes(i.program))fail();return Buffer.concat([Buffer.from([keys.indexOf(i.program),i.accounts.length,...i.accounts.map(k=>keys.indexOf(k)),i.data.length]),i.data]);});
 const message=Buffer.concat([Buffer.from([1,0,reads.length,keys.length]),...keys.map(k=>Buffer.from(bs58.decode(k))),Buffer.from(bs58.decode(blockhash)),Buffer.from([compiled.length]),...compiled]);
 const wire=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),message]);if(wire.length>1232)fail();
 const result=Object.freeze({stage:'PROTECTED_ENTRY_CONVERSION_WIRE_ONLY',readyForSigning:false,tradingEnabled:false,walletAddress:wallet,asset,source,destination,
  usdcUnits:amount.toString(),minimumCollateralUnits:minimum.toString(),blockhash,lastValidBlockHeight:height.toString(),
  computeUnitLimit:400000,computeUnitPriceMicroLamports:price,
  serializedTxBase64:wire.toString('base64'),messageBase64:message.toString('base64'),requiresFreshOracleAndFundingPolicy:true,requiresSameWireSimulation:true,
  requiresExplicitAuthorization:true,requiresDurableEntryReservation:true,requiresFinalizedReceiptBeforeOpening:true});
 proofs.set(result,Object.freeze({usdc,collateral}));return result;
}
