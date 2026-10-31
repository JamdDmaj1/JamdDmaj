import {address} from '@solana/kit';
import {deriveProtectionAddresses,getInitializeCreatorVestingInstruction} from './solana-devnet-token.js';

// Unsigned Devnet instruction preparation. The team beneficiary is separate
// from the payer and must be reviewed before any future wallet approval.
export async function prepareJamdTeamVesting({chain,mint,policy,source,payer,beneficiary}) {
  if(chain!=='solana:devnet')throw Error('JAMD_TEAM_DEVNET_ONLY');
  const derived=await deriveProtectionAddresses(mint,beneficiary);
  if(String(derived.policyAddress)!==String(policy))throw Error('JAMD_TEAM_POLICY');
  const vesting=derived.creatorVestingAddress,vault=derived.creatorVaultAddress;
  const instruction=await getInitializeCreatorVestingInstruction({ownerAddress:address(payer),beneficiaryAddress:address(beneficiary),mintAddress:address(mint),sourceAddress:address(source),policyAddress:address(policy),vestingAddress:vesting,vaultAddress:vault,totalAllocation:15000000000000n,lockedAmount:15000000000000n});
  return {chain,instruction,vestingAddress:String(vesting),vaultAddress:String(vault),teamTokens:'15000000',lockedPercent:100,requiresPolicyScheduleVerification:true,transactionAuthorized:false};
}
