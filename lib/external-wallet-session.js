// Public-account connection only. No signing, chain switching, transfers or authentication.
const CHAINS = Object.freeze({'0x1': {name:'Ethereum',symbol:'ETH'},'0x38': {name:'BNB Smart Chain',symbol:'BNB'}});
export function normalizeChain(value) {
  if(typeof value!=='string'||!/^0x[0-9a-f]{1,16}$/i.test(value))throw new Error('unsupported-network');
  const chain='0x'+BigInt(value).toString(16);
  if(!CHAINS[chain])throw new Error('unsupported-network');
  return chain;
}
export function formatNativeBalance(value) {
  if(typeof value!=='string'||!/^0x[0-9a-f]{1,64}$/i.test(value))throw new Error('invalid-balance');
  const units=BigInt(value),scale=10n**18n;
  const fraction=(units%scale).toString().padStart(18,'0').replace(/0+$/,'');
  return (units/scale).toString()+(fraction?'.'+fraction:'');
}
function address(value) {
  if(typeof value!=='string'||!/^0x[0-9a-f]{40}$/i.test(value)||/^0x0{40}$/i.test(value))throw new Error('invalid-account');
  return value;
}
function bounded(promise) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),15000)})]).finally(()=>clearTimeout(timer));
}
export function createEvmReadOnlySession(provider,onChange=()=>{}) {
  if(typeof provider?.request!=='function'||typeof provider?.on!=='function'||typeof provider?.removeListener!=='function')throw new Error('unsupported-wallet');
  let generation=0,current=null,disposed=false;
  const invalidate=()=>{generation++;current=null;onChange(null)};
  for(const event of ['accountsChanged','chainChanged','disconnect'])provider.on(event,invalidate);
  const request=(method,params)=>bounded(Promise.resolve().then(()=>provider.request({method,...(params?{params}:{})})));
  return {
    async connect(){
      if(disposed)throw new Error('disconnected');
      ++generation;current=null;onChange(null);
      const accounts=await request('eth_requestAccounts');
      const ticket=generation;
      const owner=address(Array.isArray(accounts)?accounts[0]:null);
      const chain=normalizeChain(await request('eth_chainId'));
      const confirmed=await request('eth_accounts');
      if(address(confirmed?.[0]).toLowerCase()!==owner.toLowerCase())throw new Error('account-changed');
      if(ticket!==generation||disposed)throw new Error('account-changed');
      current=Object.freeze({address:owner,chain,...CHAINS[chain]});onChange(current);return current;
    },
    async balance(){
      if(!current||disposed)throw new Error('disconnected');
      const ticket=generation, snapshot=current;
      const before=normalizeChain(await request('eth_chainId'));
      const accounts=await request('eth_accounts');
      if(before!==snapshot.chain||address(accounts?.[0]).toLowerCase()!==snapshot.address.toLowerCase()) {invalidate();throw new Error('account-changed')}
      const raw=await request('eth_getBalance',[snapshot.address,'latest']);
      const after=normalizeChain(await request('eth_chainId'));
      if(ticket!==generation||disposed||after!==snapshot.chain)throw new Error('account-changed');
      return {amount:formatNativeBalance(raw),symbol:snapshot.symbol,address:snapshot.address,chain:snapshot.chain};
    },
    disconnect(){
      if(disposed)return;disposed=true;
      for(const event of ['accountsChanged','chainChanged','disconnect'])provider.removeListener(event,invalidate);
      invalidate();
    }
  };
}
