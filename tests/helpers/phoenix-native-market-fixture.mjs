import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {decodePhoenixCatalog,planPhoenixOrder,PHOENIX_IDENTITIES as ID} from '../../lib/phoenix-market-plan.js';
import {phoenixOrderFixture} from './phoenix-order-fixture.mjs';
import {phoenixRpcAccount,phoenixTokenBytes} from './phoenix-chain-account-fixture.mjs';
const GLOBAL='2zskx2iyCvb6Stg7RBZkt1f6MrF4dpYtMG3yMvKwqtUZ';
const RESTART='SysvarLastRestartS1ot1111111111111111111111';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
function discriminator(b,name){createHash('sha256').update('account:'+name).digest().copy(b,0,0,8);return b;}
const put=(b,address,offset)=>b.set(bs58.decode(address),offset);

export async function phoenixNativeMarketFixture(){
 const f=await phoenixOrderFixture(),k=f.exchangeKeys;
 const [spline]=await getProgramDerivedAddress({programAddress:ID.program,seeds:['spline',bs58.decode(f.row.marketPubkey)]});
 f.row.splinePubkey=spline;
 const catalog=decodePhoenixCatalog([f.row],{observedAt:f.now()});f.deps.publicClient.catalog=async()=>catalog;
 const plan=planPhoenixOrder({...f.intent,catalog,referencePrice:f.quote.referencePrice,observedSlot:1000,now:f.now()});
 const global=discriminator(Buffer.alloc(2560),'global_configuration');
 put(global,GLOBAL,8);put(global,ID.canonicalUsdc,296);put(global,k.globalVault,328);put(global,k.perpAssetMap,360);
 put(global,k.globalTraderIndex[0],392);put(global,k.activeTraderBuffer[0],424);put(global,k.withdrawQueue,472);
 global[504]=131;global[505]=6;global.writeBigUInt64LE(10n,1096);
 const book=discriminator(Buffer.alloc(5504),'orderbook');book[8]=1;book.writeInt8(0,9);book.writeUInt32LE(7,32);
 book.write('DOGE',40,'ascii');book.writeBigUInt64LE(1n,56);book.writeUInt32LE(350,96);
 const arena=name=>{const b=discriminator(Buffer.alloc(96),name);b.writeUInt16LE(1,52);b.writeUInt16LE(1,54);return b;};
 const mint=()=>{const b=Buffer.alloc(82);b[44]=6;b[45]=1;return b;};
 const restart=Buffer.alloc(8);restart.writeBigUInt64LE(10n);
 const fixture=JSON.parse(readFileSync(new URL('../../node_modules/@ellipsis-labs/rise/test-fixtures/sdk-account-fixtures.json',import.meta.url),'utf8')).accounts.find(a=>a.accountType==='PerpAssetMap');
 const assetBytes=Buffer.from(fixture.dataBase64,'base64'),old=Buffer.from(bs58.decode('Hqt5Vom5L3X3RcKysKnBmLAvjYgo6TGAwoheW658h5cz'));
 const offset=assetBytes.indexOf(old);assert.ok(offset>=0);assert.equal(assetBytes.indexOf(old,offset+1),-1);put(assetBytes,f.row.marketPubkey,offset);
 const map=new Map([
  [GLOBAL,phoenixRpcAccount(ID.program,global)],[f.row.marketPubkey,phoenixRpcAccount(ID.program,book)],
  [spline,phoenixRpcAccount(ID.program,discriminator(Buffer.alloc(64),'spline_collection'))],
  [k.globalVault,phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.canonicalUsdc,k.globalVault,100000000n))],
  [ID.usdc,phoenixRpcAccount(TOKEN,mint())],[ID.canonicalUsdc,phoenixRpcAccount(TOKEN,mint())],
  [RESTART,phoenixRpcAccount('Sysvar1111111111111111111111111111111111111',restart,1)],
  [k.globalTraderIndex[0],phoenixRpcAccount(ID.program,arena('global_trader_index'))],
  [k.activeTraderBuffer[0],phoenixRpcAccount(ID.program,arena('active_trader_buffer'))],
  [k.perpAssetMap,phoenixRpcAccount(ID.program,assetBytes)]
 ]);
 const calls=[];
 const request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method!=='getMultipleAccounts')throw Error('UNEXPECTED_NATIVE_RPC');
  return {context:{slot:1000},value:params[0].map(address=>{
   const a=map.get(address);if(!a)return null;const slice=params[1].dataSlice;
   if(!slice)return a;
   return {...a,data:[Buffer.from(a.data[0],'base64').subarray(slice.offset,slice.offset+slice.length).toString('base64'),'base64']};
  })};
 };
 return {...f,catalog,plan,nativeMap:map,nativeCalls:calls,nativeRequest:request,
  nativeOptions:{exchangeKeys:k,request,now:f.now,monotonicNow:f.monotonicNow},GLOBAL,RESTART};
}
