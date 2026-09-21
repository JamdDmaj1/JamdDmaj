export async function getBitgetPublicReview(symbol, fetcher = fetch, now = Date.now) {
  if (typeof symbol !== 'string' || !/^[A-Z0-9]{2,20}USDT$/.test(symbol)) throw new Error('Invalid USDT contract.');
  const query=new URLSearchParams({productType:'USDT-FUTURES',symbol});
  const read=async endpoint=>{
    const response=await fetcher(`https://api.bitget.com/api/v2/mix/market/${endpoint}?${query}`,{method:'GET',signal:AbortSignal.timeout(8000),cache:'no-store'});
    if(!response.ok)throw new Error('Bitget public data unavailable.');
    const body=await response.json();
    if(body.code!=='00000'||!Array.isArray(body.data))throw new Error('Invalid Bitget public response.');
    return body;
  };
  const [contracts,tickers]=await Promise.all([read('contracts'),read('ticker')]);
  const contract=contracts.data.find(item=>item.symbol===symbol),ticker=tickers.data.find(item=>item.symbol===symbol);
  if(!contract||contract.symbolStatus!=='normal'||contract.quoteCoin!=='USDT'||!contract.supportMarginCoins?.includes('USDT'))throw new Error('Contract unavailable for USDT trading.');
  const price=Number(ticker?.lastPr),timestamp=Number(ticker?.ts);
  const checkedAt=now();
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(timestamp)||timestamp>checkedAt+5000||checkedAt-timestamp>30000)throw new Error('Quote missing or stale.');
  return {symbol,price,timestamp,checkedAt,source:'Bitget public API',orderSubmitted:false,
    minLeverage:contract.minLever,maxLeverage:contract.maxLever,minNotional:contract.minTradeUSDT,
    minQuantity:contract.minTradeNum,quantityStep:contract.sizeMultiplier};
}
