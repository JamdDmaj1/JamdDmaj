import test from 'node:test';
import assert from 'node:assert/strict';
import {pushStateLabel} from '../lib/push-controls.js';
test('notification status distinguishes saved, expired, disabled, blocked and unknown',()=>{
 assert.equal(pushStateLabel({known:false}),'unknown');
 assert.equal(pushStateLabel({enabled:true,expiresAt:2000,now:1000,permission:'granted'}),'active');
 assert.equal(pushStateLabel({enabled:true,expiresAt:2000,now:3000}),'expired');
 assert.equal(pushStateLabel({enabled:false}),'off');
 assert.equal(pushStateLabel({enabled:true,expiresAt:2000,now:1000,permission:'denied'}),'blocked');
 assert.equal(pushStateLabel({enabled:true,expiresAt:null}),'off');
});
