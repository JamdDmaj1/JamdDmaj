import test from 'node:test';
import assert from 'node:assert/strict';
import {positionDisplayMetrics,displayUsdDecimal} from '../lib/position-display-metrics.js';
const now=1800000000000,p={side:'LONG',priceUsdUnits:'100000000',sizeUsdUnits:'300000000',collateralUsdUnits:'100000000'};
test('price PnL and return use the position entry and observed collateral, not wallet funds',()=>{
 const q={priceUsdUnits:'110000000',observedAt:now};
 const long=positionDisplayMetrics(p,q,{now}),short=positionDisplayMetrics({...p,side:'SHORT'},q,{now});
 assert.equal(long.pnlUsdUnits,'30000000');assert.equal(long.roeBasisPoints,'3000');assert.equal(short.pnlUsdUnits,'-30000000');assert.equal(short.roeBasisPoints,'-3000');assert.equal(long.leverageHundredths,'300');assert.equal(long.excludesFeesAndFunding,true);
 assert.equal(positionDisplayMetrics(p,{...q,priceUsdUnits:'90000000'},{now}).pnlUsdUnits,'-30000000');
 assert.equal(displayUsdDecimal('-30000001'),'-30.000001');assert.equal(displayUsdDecimal('1'),'0.000001');
});
test('missing, stale, future, zero or malformed reference never becomes a zero-profit claim',()=>{
 for(const q of [null,{}, {priceUsdUnits:'0',observedAt:now},{priceUsdUnits:'110000000',observedAt:now-15001},{priceUsdUnits:'110000000',observedAt:now+2001},{priceUsdUnits:'NaN',observedAt:now}])assert.equal(positionDisplayMetrics(p,q,{now}),null);
 for(const patch of [{side:'BUY'},{priceUsdUnits:'0'},{sizeUsdUnits:'-1'},{collateralUsdUnits:'0'}])assert.equal(positionDisplayMetrics({...p,...patch},{priceUsdUnits:'110000000',observedAt:now},{now}),null);
});
