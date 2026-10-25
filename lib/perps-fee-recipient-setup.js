// Operator-only unsigned preparation. No signer, private key, customer funding
// or submission transport. The owner must review a fresh operation in-wallet.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {createHash} from 'node:crypto';
import {PERPS_PLATFORM_FEE} from './perps-platform-fee.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
function fail(code='FEE_RECIPIENT_SETUP_UNVERIFIED'){throw Error(code);}
function integer(value){if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function key(value){try{const b=bs58.decode(value);if(b.length!==32||bs58.encode(b)!==value)fail();return Buffer.from(b);}catch{fail();}}
function data(account,length,owner){
 if(!account||account.owner!==owner||account.executable!==false||!Array.isArray(account.data)||account.data.length!==2||account.data[1]!=='base64')fail();
 integer(account.lamports);const b=Buffer.from(account.data[0],'base64');if(b.length!==length||b.toString('base64')!==account.data[0])fail();return b;
}
function usdcAccount(account,owner,mint){
 const b=data(account,165,TOKEN);if(!b.subarray(0,32).equals(key(mint))||!b.subarray(32,64).equals(key(owner))||b[108]!==1)fail();return b;
}
function slot(response,minimum=0){const n=integer(response?.context?.slot);if(n<minimum)fail();return n;}
export async function preparePerpsFeeRecipientSetup({request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const at=integer(now()),started=monotonicNow();
 const fresh=()=>{const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000||now()<at||now()-at>15000)fail();};
 const owner=PERPS_PLATFORM_FEE.recipient,mint=PERPS_PLATFORM_FEE.mint;
 const [destination]=await getProgramDerivedAddress({programAddress:ASSOCIATED,seeds:[key(owner),key(TOKEN),key(mint)]});fresh();
 if(await request('getGenesisHash',[])!==GENESIS)fail();fresh();
 const bank=await request('getMultipleAccounts',[[owner,mint,destination],{encoding:'base64',commitment:'confirmed'}]);fresh();
 const minimum=slot(bank),values=bank.value;if(!Array.isArray(values)||values.length!==3)fail();
 data(values[0],0,SYSTEM);const mintData=data(values[1],82,TOKEN);if(mintData[44]!==6||mintData[45]!==1)fail();
 if(values[2]!==null){
  usdcAccount(values[2],owner,mint);
  return Object.freeze({stage:'FEE_RECIPIENT_USDC_ALREADY_EXISTS',network:'solana-mainnet',owner,mint,destination,
   observedSlot:minimum,preparedAt:at,readyForSigning:false,signed:false,submitted:false});
 }
 const latest=await request('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:minimum}]);fresh();
 const observedSlot=slot(latest,minimum),blockhash=latest.value?.blockhash,lastValidBlockHeight=integer(latest.value?.lastValidBlockHeight);
 const rent=integer(await request('getMinimumBalanceForRentExemption',[165,{commitment:'confirmed'}]));fresh();
 if(rent<1||rent>10000000)fail();
 // One idempotent ATA-creation instruction. Payer AND token-account owner are
 // the operator's fixed Phantom address, never a trader or the bot wallet.
 const keys=[owner,destination,mint,SYSTEM,TOKEN,ASSOCIATED];
 if(new Set(keys).size!==6)fail();
 const message=Buffer.concat([Buffer.from([1,0,4,6]),...keys.map(key),key(blockhash),Buffer.from([1,5,6,0,1,0,2,3,4,1,1])]);
 const feeResponse=await request('getFeeForMessage',[message.toString('base64'),{commitment:'confirmed',minContextSlot:observedSlot}]);fresh();
 slot(feeResponse,observedSlot);const fee=integer(feeResponse.value);if(fee<1||fee>10000)fail();
 const total=rent+fee;if(!Number.isSafeInteger(total)||values[0].lamports<total)fail('FEE_RECIPIENT_SETUP_INSUFFICIENT_OPERATOR_SOL');
 const wire=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),message]);
 const simulation=await request('simulateTransaction',[wire.toString('base64'),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,
  commitment:'confirmed',minContextSlot:observedSlot,accounts:{encoding:'base64',addresses:[owner,destination]}}]);fresh();
 slot(simulation,observedSlot);const result=simulation.value;
 if(!result||result.err!==null||!Array.isArray(result.accounts)||result.accounts.length!==2)fail();
 data(result.accounts[0],0,SYSTEM);const token=usdcAccount(result.accounts[1],owner,mint);
 if(result.accounts[0].lamports!==values[0].lamports-total||result.accounts[1].lamports!==rent||token.readBigUInt64LE(64)!==0n
  ||token.readUInt32LE(72)!==0||token.readUInt32LE(109)!==0||token.readBigUInt64LE(121)!==0n||token.readUInt32LE(129)!==0)fail();
 if(await request('getGenesisHash',[])!==GENESIS)fail();fresh();
 return Object.freeze({stage:'UNSIGNED_FEE_RECIPIENT_USDC_SETUP',network:'solana-mainnet',owner,mint,destination,
  payer:owner,preparedAt:at,reviewExpiresAt:at+60000,observedSlot,blockhash,lastValidBlockHeight,
  operatorBalanceLamports:String(values[0].lamports),rentReserveLamports:String(rent),networkFeeLamports:String(fee),estimatedTotalLamports:String(total),
  serializedTxBase64:wire.toString('base64'),messageSha256:createHash('sha256').update(message).digest('hex'),
  operation:'CREATE_ASSOCIATED_USDC_ACCOUNT_IDEMPOTENT',usdcTransferredUnits:'0',
  requiresFreshWalletReview:true,readyForSigning:false,signed:false,submitted:false});
}
