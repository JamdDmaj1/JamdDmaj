import {address} from '@solana/kit';
import {deriveProtectionAddresses,getInitializeCreatorVestingInstruction} from './solana-devnet-token.js';
import {decodeLaunchPolicy,decodeToken2022Mint,decodeToken2022Account} from './solana-account-codecs.js';
import {JAMDDMAJ_LOCK_PROGRAM_ADDRESS,DEVNET_RPC_URL} from './solana-devnet-token.js';
const TOKEN_PROGRAM='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export async function checkJamdTeamVestingAccounts({chain,mint,policy,source,payer,beneficiary,fetchImpl=globalThis.fetch}) {
  const preparation=await prepareJamdTeamVesting({chain,mint,policy,source,payer,beneficiary});
  const response=await fetchImpl(DEVNET_RPC_URL,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(12000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[[mint,policy,source,preparation.vestingAddress,preparation.vaultAddress],{encoding:'base64',commitment:'confirmed'}]})});
  if(!response?.ok)throw Error('JAMD_TEAM_RPC');
  const payload=await response.json();
  const values=payload?.result?.value;
  if(payload.error||!Array.isArray(values)||values.length!==5||values.slice(0,3).some(value=>!value))throw Error('JAMD_TEAM_ACCOUNTS');
  if(values[3]||values[4])throw Error('JAMD_TEAM_ALREADY_INITIALIZED');
  const m=decodeToken2022Mint(values[0],mint),p=await decodeLaunchPolicy(values[1],policy),s=decodeToken2022Account(values[2],source);
  if(m.owner!==TOKEN_PROGRAM||!m.initialized||m.decimals!==6||m.supply!=='100000000000000'||m.hasMintAuthority||m.hasFreezeAuthority)throw Error('JAMD_TEAM_MINT');
  if(p.owner!==JAMDDMAJ_LOCK_PROGRAM_ADDRESS||p.tokenMint!==mint||p.authority!==payer||p.version!==2||p.cliffSeconds!==731*86400||p.releaseSeconds!==1096*86400)throw Error('JAMD_TEAM_SCHEDULE_OR_AUTHORITY');
  if(s.owner!==TOKEN_PROGRAM||s.authority!==payer||s.mint!==mint||s.amount<15000000000000n)throw Error('JAMD_TEAM_SOURCE');
  return {...preparation,requiresPolicyScheduleVerification:false,accountsChecked:true,transactionAuthorized:false};
}

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
