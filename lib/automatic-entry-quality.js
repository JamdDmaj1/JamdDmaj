// Shared strategy filter, independent of exchange credentials or execution.
// This is signal quality only, never an authorization to spend funds.
export function evaluateAutomaticEntryQuality(signal={},gate={}){
 const side=String(signal.side||'').toUpperCase();
 const expectedTrend=side==='LONG'?'bullish':side==='SHORT'?'bearish':'';
 const score=Number(signal.score||0),volumeRatio=Number(signal.volumeRatio||0),adx=Number(signal.adx||0);
 const spread=Number(signal.spreadPercent||signal.spread||0);
 const liquidity=Number(signal.quoteVolume||signal.liquidityUsd||signal.liquidity24h||0);
 const minimumLiquidity=Math.max(1,Number(gate.minLiquidityUsd??3000000));
 if(!expectedTrend)return {ok:false,reason:'invalid side'};
 if(!Number.isFinite(score)||score<12)return {ok:false,reason:'live score below 12'};
 if(String(signal.marketAlignment||'').toLowerCase()!=='with-market')return {ok:false,reason:'conservative live blocks counter/neutral market trades'};
 if(!String(signal.higherTrend||'').toLowerCase().includes(expectedTrend))return {ok:false,reason:`conservative live needs ${expectedTrend} 4h alignment`};
 if(!String(signal.microTrend||'').toLowerCase().includes(expectedTrend))return {ok:false,reason:`conservative live needs ${expectedTrend} 15m alignment`};
 if(!Number.isFinite(volumeRatio)||volumeRatio<1.2)return {ok:false,reason:'conservative live volume below 1.20x'};
 if(!Number.isFinite(adx)||adx<22)return {ok:false,reason:'conservative live ADX below 22'};
 if(!Number.isFinite(spread)||spread<=0||spread>0.0025)return {ok:false,reason:'conservative live spread unavailable or above 0.25%'};
 if(!Number.isFinite(minimumLiquidity)||!Number.isFinite(liquidity)||liquidity<minimumLiquidity)return {ok:false,reason:`conservative live liquidity below ${minimumLiquidity}`};
 return {ok:true,reason:'passed conservative automatic entry gate'};
}
