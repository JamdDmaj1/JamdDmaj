// Public price lookup only. It neither authorizes an order nor replaces
// independent on-chain execution-price and funding validation.
const MINTS=Object.freeze({BTC:'3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',ETH:'7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',SOL:'So11111111111111111111111111111111111111112'});
export async function readPerpsMarketReference(asset,{fetchImpl=globalThis.fetch}={}){
 if(!Object.hasOwn(MINTS,asset)||typeof fetchImpl!=='function')throw Error('PERPS_REFERENCE_UNAVAILABLE');
 const response=await fetchImpl('https://perps-api.jup.ag/v1/market-stats?mint='+MINTS[asset],{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(5000)});
 if(!response.ok||response.redirected)throw Error('PERPS_REFERENCE_UNAVAILABLE');
 const raw=await response.text();if(raw.length>8192)throw Error('PERPS_REFERENCE_UNAVAILABLE');
 const value=JSON.parse(raw),price=Number(value.price);
 if(typeof value.price!=='string'||!/^\d+(\.\d+)?$/.test(value.price)||!Number.isFinite(price)||price<0.000001||price>=1e9)throw Error('PERPS_REFERENCE_UNAVAILABLE');
 return price.toFixed(6);
}
