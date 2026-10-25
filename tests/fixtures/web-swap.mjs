import bs58 from 'bs58';
import {SWAP_IDS as I,associated,to64} from '../../lib/web-swap-policy.js';
export function little(value,size){const data=new Uint8Array(size);let n=BigInt(value);for(let i=0;i<size;i++){data[i]=Number(n&255n);n>>=8n;}return data;}
const concat=(...values)=>Uint8Array.from(values.flatMap(v=>Array.from(v)));
export const encoded=data=>[to64(data),'base64'];
export function token(owner,mint,amount,rent=2039280){const data=new Uint8Array(165);data.set(bs58.decode(mint));data.set(bs58.decode(owner),32);data.set(little(amount,8),64);data[108]=1;if(mint===I.SOL){data[109]=1;data.set(little(rent,8),113);}return {owner:I.TOKEN,executable:false,lamports:rent,data:encoded(data)};}
export async function swapFixture(payer,{nativeInput=true,now=Date.now()}={}){
 const inputMint=nativeInput?I.SOL:I.USDC,outputMint=nativeInput?I.USDC:I.SOL,source=await associated(payer,inputMint),destination=await associated(payer,outputMint);
 const input=nativeInput?100000000n:10000000n,quoted=nativeInput?10000000n:100000000n,minimum=(quoted*9900n+9999n)/10000n;
 const intent={payer,inputMint,outputMint,amount:String(input),slippageBps:100};
 const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
 const ix=(programId,accounts,data)=>({programId,accounts,data:to64(data)});
 const create=(account,mint)=>ix(I.ATA,[meta(payer,true,true),meta(account,true),meta(payer),meta(mint),meta(I.SYSTEM),meta(I.TOKEN)],Uint8Array.of(1));
 const event=bs58.encode(new Uint8Array(32).fill(6));
 const route=concat([187,100,250,204,49,196,175,20],little(input,8),little(quoted,8),little(100,2),little(0,2),little(0,2),little(1,4),[0,100,0,0,1]);
 const instructions=[ix(I.COMPUTE,[],concat([2],little(1400000,4))),...(nativeInput?[create(source,inputMint)]:[]),create(destination,outputMint),
  ...(nativeInput?[ix(I.SYSTEM,[meta(payer,true,true),meta(source,true)],concat(little(2,4),little(input,8))),ix(I.TOKEN,[meta(source,true)],Uint8Array.of(17))]:[]),
  ix(I.JUPITER,[meta(payer,false,true),meta(source,true),meta(destination,true),meta(inputMint),meta(outputMint),meta(I.TOKEN),meta(I.TOKEN),meta(I.JUPITER),meta(event),meta(I.JUPITER)],route),
  ix(I.TOKEN,[meta(nativeInput?source:destination,true),meta(payer,true),meta(payer,false,true)],Uint8Array.of(9))];
 const preparation={network:'solana-mainnet-beta',taker:payer,inputMint,outputMint,inAmount:String(input),outAmount:String(quoted),minimumOut:String(minimum),slippageBps:100,instructions,blockhash:bs58.encode(new Uint8Array(32).fill(8)),lastValidBlockHeight:'500',receivedAt:now,expiresAt:now+15000,requiresNativeValidation:true,executable:false};
 const sol=1000000000,fee=5000,rent=2039280;
 const system=lamports=>({owner:I.SYSTEM,executable:false,lamports,data:encoded(new Uint8Array())});
 const mint=decimals=>{const d=new Uint8Array(82);d[44]=decimals;d[45]=1;return {owner:I.TOKEN,executable:false,lamports:rent,data:encoded(d)};};
 const before=new Map([[payer,system(sol)],[source,nativeInput?null:token(payer,inputMint,30000000n)],[destination,null],[inputMint,mint(nativeInput?9:6)],[outputMint,mint(nativeInput?6:9)]]);
 const after=nativeInput?[system(sol-fee-rent-Number(input)),null,token(payer,outputMint,quoted)]:[system(sol-fee+Number(quoted)),token(payer,inputMint,30000000n-input),null];
 const calls=[];
 async function rpc(method,params){calls.push({method,params});switch(method){
  case 'getGenesisHash':return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  case 'getSlot':return 100;
  case 'getLatestBlockhash':return {context:{slot:100},value:{blockhash:preparation.blockhash,lastValidBlockHeight:500}};
  case 'getMultipleAccounts':return {context:{slot:100},value:params[0].map(k=>before.get(k)??null)};
  case 'getBlockHeight':return 200;
  case 'isBlockhashValid':return {context:{slot:100},value:true};
  case 'getFeeForMessage':return {context:{slot:100},value:fee};
  case 'getMinimumBalanceForRentExemption':return rent;
  case 'simulateTransaction':return {context:{slot:100},value:{err:null,unitsConsumed:200000,accounts:after}};
  default:throw Error('UNEXPECTED_RPC_'+method);
 }}
 return {intent,preparation,rpc,calls,before,after,source,destination,fee,rent};
}
