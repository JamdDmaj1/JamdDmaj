import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AccountRole } from '@solana/kit';
import { deriveProtectionAddresses, getInitializeCreatorVestingInstruction, getClaimVestedInstruction } from '../lib/solana-devnet-token.js';

const plan = JSON.parse(readFileSync(new URL('../security/jamd-allocation-plan.json', import.meta.url)));
const owner = '2RmDx5KLnEWG8wxdpdB6Z4ySDn9Z2Jir5aaCdg1ARCom';
const mint = 'Gdvhja25md5P4B9LpX5NSD1QmS32rTwTbLwqnkEdfTdB';
const source = '2aH5uHjXMN3SzDyHSHCoMycTcbcw8rT6CMf8wq4Z6TcT';

test('category instruction drafts separate funding signer from multisig beneficiary', async () => {
  const vestings = new Set();
  const policies = new Set();
  for (const allocation of plan.allocations.filter(a => BigInt(a.lockedTokens) > 0n)) {
    const beneficiaryAddress = allocation.beneficiary;
    const derived = await deriveProtectionAddresses(mint, beneficiaryAddress);
    vestings.add(derived.creatorVestingAddress);
    policies.add(derived.policyAddress);
    const args = {ownerAddress:owner, beneficiaryAddress, mintAddress:mint, sourceAddress:source,
      policyAddress:derived.policyAddress, vestingAddress:derived.creatorVestingAddress,
      vaultAddress:derived.creatorVaultAddress, totalAllocation:BigInt(allocation.totalTokens)*1000000000n,
      lockedAmount:BigInt(allocation.lockedTokens)*1000000000n};
    const ix = await getInitializeCreatorVestingInstruction(args);
    assert.equal(ix.accounts[1].address, owner);
    assert.equal(ix.accounts[8].address, owner);
    assert.equal(ix.accounts[2].address, beneficiaryAddress);
    assert.equal(ix.accounts[2].role, AccountRole.READONLY);
    const data = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    assert.equal(data.getBigUint64(8,true), args.totalAllocation);
    assert.equal(data.getBigUint64(16,true), args.lockedAmount);
    const claim = await getClaimVestedInstruction({...args, destinationAddress:source});
    assert.equal(claim.accounts[1].address, beneficiaryAddress);
    assert.equal(claim.accounts[1].role, AccountRole.WRITABLE_SIGNER);
    const legacy = await getInitializeCreatorVestingInstruction({...args,beneficiaryAddress:undefined});
    assert.equal(legacy.accounts[2].address, owner);
  }
  assert.equal(vestings.size,4);
  assert.equal(policies.size,1);
});
