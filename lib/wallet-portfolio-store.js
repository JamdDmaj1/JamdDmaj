// Shared PUBLIC display state only. No credentials, session secrets or signing capability.
const stores=new WeakMap();
const state=doc=>{let value=stores.get(doc);if(!value){value={account:null,portfolio:null,accounts:new Map()};stores.set(doc,value);}return value;};
function emit(doc,detail){const Type=doc.defaultView?.CustomEvent||globalThis.CustomEvent;if(Type&&doc.dispatchEvent)doc.dispatchEvent(new Type('jamd-wallet-portfolio',{detail}));}
export function selectedWalletAccount(doc){return state(doc).account;}
export function walletAccounts(doc){return [...state(doc).accounts.values()];}
export function forgetWalletAccount(doc,account){
 const store=state(doc);if(!account)return;
 store.accounts.delete(account.source+':'+account.address);
 if(store.account?.source===account.source&&store.account?.address===account.address)selectWalletAccount(doc,null);
}
export function selectWalletAccount(doc,account){
 const store=state(doc);
 if(account&&(!['native','external'].includes(account.source)||typeof account.address!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(account.address)))throw Error('Invalid public wallet selection');
 if(store.account?.address===account?.address&&store.account?.source===account?.source)return;
 store.account=account?Object.freeze({address:account.address,source:account.source,name:String(account.name||'Wallet').slice(0,60)}):null;
 if(store.account)store.accounts.set(store.account.source+':'+store.account.address,store.account);
 store.portfolio=null;emit(doc,null);
}
export function publishWalletPortfolio(doc,data,account){
 const store=state(doc);
 if(account&&(store.account?.address!==account.address||store.account?.source!==account.source))return false;
 const timestamp=data?Date.parse(data.updatedAt):0;
 if(data&&(!store.account||data.address!==store.account.address||data.network!=='solana:mainnet'||data.ok!==true||!Array.isArray(data.tokens)||!Number.isFinite(timestamp)||Date.now()-timestamp>120000||timestamp-Date.now()>5000))return false;
 store.portfolio=data?Object.freeze({...data,sol:data.sol?Object.freeze({...data.sol}):null,tokens:Object.freeze((data.tokens||[]).map(token=>Object.freeze({...token})))}):null;
 emit(doc,store.portfolio);return true;
}
export function currentWalletPortfolio(doc){return state(doc).portfolio;}
