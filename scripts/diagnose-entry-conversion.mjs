// Read-only feasibility probe: unsigned simulation only, never signer/custody.
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import {PERPS_CUSTODIES,decodeServerPerpsCustody} from '../lib/perps-server-custody.js';
import {decodePerpsConversionOracleBounds} from '../lib/perps-close-conversion-simulation.js';
import {buildUnsignedPerpsEntryConversionWire,minimumPerpsEntryCollateralUnits} from '../lib/perps-entry-conversion-wire.js';
import {simulatePerpsEntryConversion} from '../lib/perps-entry-conversion-simulation.js';
import {prepareProtectedPerpsEntryConversion} from '../lib/perps-entry-conversion-preparation.js';
import {readPerpsMarketReference} from '../lib/perps-market-reference.js';
const wallet='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T';
const raw=readFileSync('/proc/'+process.argv[2]+'/environ','utf8').split('\0'),url=raw.find(s=>s.startsWith('JAMDDMAJ_PERPS_RPC_URL='))?.slice('JAMDDMAJ_PERPS_RPC_URL='.length);
const request=createServerPerpsReadOnlyRpc({url:url||'https://api.mainnet-beta.solana.com'});
if(process.argv[3]==='IDL'){
 const r=await request('getMultipleAccounts',[['38GK1i4cQPAxqrbfKX4RRMNfXpKRn5PgLFHVJeXm1C8Y'],{encoding:'base64',commitment:'confirmed'}]),a=r.value[0];
 if(a.owner!=='PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu'||a.executable)throw Error('INVALID_IDL_OWNER');
 const b=Buffer.from(a.data[0],'base64'),n=b.readUInt32LE(40),decoded=inflateSync(b.subarray(44,44+n)),idl=JSON.parse(decoded);
 const types=new Map(idl.types.map(t=>[t.name,t.type]));
 const size=t=>typeof t==='string'?({u8:1,i8:1,bool:1,u16:2,i16:2,u32:4,i32:4,f32:4,u64:8,i64:8,f64:8,u128:16,i128:16,publicKey:32}[t]??(()=>{throw Error('UNKNOWN_TYPE_'+t);})()):t.array?size(t.array[0])*t.array[1]:t.defined?size(types.get(t.defined)):t.kind==='struct'?t.fields.reduce((n,f)=>n+size(f.type),0):t.kind==='enum'?1:(()=>{throw Error('UNKNOWN_COMPLEX_TYPE');})();
 let offset=8;const layout=idl.accounts.find(t=>t.name==='Custody').type.fields.map(f=>{const length=size(f.type),result={name:f.name,type:f.type,offset,length};offset+=length;return result;});
 console.log(JSON.stringify({stage:'NATIVE_IDL',slot:r.context.slot,sha256:createHash('sha256').update(decoded).digest('hex'),layout,total:offset}));process.exit(0);
}
const asset=process.argv[3]||'BTC';if(!['BTC','ETH','SOL'].includes(asset))throw Error('INVALID_ASSET');
if(process.argv[4]==='JOINED'){
 const referencePrice=await readPerpsMarketReference(asset);
 const r=await prepareProtectedPerpsEntryConversion({asset,side:'LONG',margin:'10',leverage:'3',referencePrice},wallet,{request});
 console.log(JSON.stringify({stage:r.stage,asset,readyForSigning:r.readyForSigning,submitted:r.submitted,observedSlot:r.observedSlot}));process.exit(0);
}
if(await request('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('WRONG_NETWORK');
const names=['USDC',asset],reply=await request('getMultipleAccounts',[names.map(a=>PERPS_CUSTODIES[a].address),{commitment:'confirmed',encoding:'base64'}]);
const [u,c]=names.map((a,i)=>decodeServerPerpsCustody(a,PERPS_CUSTODIES[a].address,reply.value[i]));
const oracles=await request('getMultipleAccounts',[[u.dovesAgOracle,c.dovesAgOracle],{commitment:'confirmed',encoding:'base64',minContextSlot:reply.context.slot}]);
const [up,cp]=await Promise.all([u,c].map((a,i)=>decodePerpsConversionOracleBounds(a,oracles.value[i],{nowSeconds:Math.floor(Date.now()/1000)})));
const floor=BigInt(minimumPerpsEntryCollateralUnits({usdcUnits:'10000000',outputDecimals:c.decimals,usdcPriceLowerUsdUnits:up.priceLowerUsdUnits,outputPriceUpperUsdUnits:cp.priceUpperUsdUnits,maxSlippageBps:50}));
// Require a slightly higher output, never a lower one, to leave a 2 bps
// preparation drift buffer. The independent simulation still enforces 50 bps.
const minimum=((floor*10002n+9999n)/10000n).toString();
const latest=await request('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:oracles.context.slot}]);
const wire=await buildUnsignedPerpsEntryConversionWire({walletAddress:wallet,asset,blockhash:latest.value.blockhash,lastValidBlockHeight:String(latest.value.lastValidBlockHeight),usdcUnits:'10000000',minimumCollateralUnits:minimum},u,c);
const simulation=await request('simulateTransaction',[wire.serializedTxBase64,{encoding:'base64',commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false,minContextSlot:latest.context.slot}]);
console.log(JSON.stringify({stage:'ENTRY_CONVERSION_UNSIGNED_SIMULATION',asset,error:simulation.value.err,unitsConsumed:simulation.value.unitsConsumed,minimumCollateralUnits:minimum,readyForSigning:false,submitted:false,logs:simulation.value.err?simulation.value.logs?.slice(-5):undefined}));
let before,after,keys;
const observedRequest=async(method,params)=>{const r=await request(method,params);if(method==='getMultipleAccounts'&&params[0].length===10){keys=params[0];before=r.value;}if(method==='simulateTransaction'&&params[1].accounts)after=r.value.accounts;return r;};
try{const result=await simulatePerpsEntryConversion(wire,{request:observedRequest,minimumSlot:latest.context.slot});console.log(JSON.stringify({stage:result.stage,asset,readyForSigning:result.readyForSigning,submitted:false}));}
catch(e){const changes=[];if(before&&after&&keys)for(const address of [u.address,c.address]){const i=keys.indexOf(address),a=Buffer.from(before[i].data[0],'base64'),b=Buffer.from(after[i].data[0],'base64'),u128=(d,p)=>d.readBigUInt64LE(p)+(d.readBigUInt64LE(p+8)<<64n);changes.push({asset:address===u.address?'USDC':asset,offsets:Array.from(a.keys()).filter(j=>a[j]!==b[j]),debtDelta:(u128(b,1004)-u128(a,1004)).toString(),accrualDelta:(u128(b,1020)-u128(a,1020)).toString(),borrowInterestDelta:(u128(b,972)-u128(a,972)).toString(),borrowLastUpdate:b.readBigInt64LE(988).toString()});}console.log(JSON.stringify({stage:'ENTRY_CONVERSION_EFFECTS',asset,error:e.message,changes,frames:String(e.stack).split('\n').slice(1,4)}));process.exitCode=1;}
