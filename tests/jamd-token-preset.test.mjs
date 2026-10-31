import test from 'node:test';
import assert from 'node:assert/strict';
import {applyJamdTokenPreset} from '../lib/jamd-token-preset.js';
import {normalizeFairLaunchDraft} from '../lib/fair-launch.js';
test('JAMD identity preset preserves unrelated draft settings and never authorizes a launch',()=>{
 const original={purpose:'My project',logoUrl:'https://example.com/logo.png',creatorLockPercent:100};
 const updated=applyJamdTokenPreset(original),normalized=normalizeFairLaunchDraft(updated);
 assert.equal(normalized.symbol,'JAMD');assert.equal(normalized.totalSupply,100000000);assert.equal(normalized.decimals,6);
 assert.equal(updated.purpose,original.purpose);assert.equal(updated.creatorLockPercent,100);
 assert.equal(original.symbol,undefined);assert.equal(updated.mainnetEnabled,undefined);assert.equal(updated.administration,undefined);
});
