import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPerpsConversionCustodyAccrual as check} from '../lib/perps-conversion-custody-accrual.js';
const base=()=>{const b=Buffer.alloc(1200);b.writeBigInt64LE(1000n,988);b.writeBigUInt64LE(10n,972);b.writeBigUInt64LE(50n,996);b.writeBigUInt64LE(100n,1004);b.writeBigUInt64LE(20n,1020);return b;};
test('native borrow accrual preserves principal and exact tail configuration',()=>{
 const a=base(),b=Buffer.from(a);b.writeBigInt64LE(1001n,988);b.writeBigUInt64LE(11n,972);b.writeBigUInt64LE(102n,1004);b.writeBigUInt64LE(22n,1020);
 assert.deepEqual(check(a,b,{nowSeconds:1001}),{borrowInterestIndexDelta:'1',borrowDebtInterestDelta:'2'});
 assert.equal(check(a,a,{nowSeconds:1001}).borrowDebtInterestDelta,'0');
});
test('forged principal, clocks, index regression and every immutable tail byte fail closed',()=>{
 const a=base();for(const offset of [286,294,384,416,932,971,996,1003,1036,1084,1093,1117,1199]){const b=Buffer.from(a);b[offset]^=1;assert.throws(()=>check(a,b,{nowSeconds:1001}));}
 for(const change of [b=>b.writeBigUInt64LE(101n,1004),b=>b.writeBigInt64LE(999n,988),b=>b.writeBigInt64LE(1004n,988),b=>b.writeBigUInt64LE(9n,972),b=>b.writeBigUInt64LE(11n,972),b=>{b.writeBigUInt64LE(101n,1004);b.writeBigUInt64LE(21n,1020);b.writeBigInt64LE(1001n,988);}]){const b=Buffer.from(a);change(b);assert.throws(()=>check(a,b,{nowSeconds:1001}));}
 assert.throws(()=>check(Buffer.alloc(1000),Buffer.alloc(1000),{nowSeconds:1001}));
});
