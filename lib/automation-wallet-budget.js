// Read-only allocation planning. Does not transfer funds or grant signing rights.
import bs58 from 'bs58';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const AUTOMATION_USDC_MINT=USDC;
function units(value){if(typeof value!=='string'||!/^\d{1,20}$/.test(value))throw Error('INVALID_UNITS');return BigInt(value);}
export function planWalletAutomationBudget({walletAddress,network,mint,balanceUnits,reservedManualUnits,reservedBotUnits,feeReserveUnits,requestedBotUnits,observedAt},now=Date.now()){
  try{if(bs58.decode(walletAddress).length!==32)throw Error();}catch{throw Error('INVALID_WALLET');}
  if(network!=='solana-mainnet'||mint!==USDC)throw Error('UNSUPPORTED_COLLATERAL');
  if(!Number.isFinite(observedAt)||now-observedAt>10000||observedAt>now+2000)throw Error('STALE_BALANCE');
  const balance=units(balanceUnits),manual=units(reservedManualUnits),bot=units(reservedBotUnits),fees=units(feeReserveUnits),requested=units(requestedBotUnits);
  const reserved=manual+bot+fees;
  if(reserved>balance)throw Error('UNRECONCILED_RESERVATIONS');
  const available=balance-reserved;
  if(requested>available)throw Error('INSUFFICIENT_UNRESERVED_BALANCE');
  return Object.freeze({walletAddress,network,mint,decimals:6,balanceUnits:balance.toString(),unreservedUnits:available.toString(),requestedBotUnits:requested.toString(),remainingManualUnits:(available-requested).toString(),stage:'ALLOCATION_PLAN_ONLY',signingAuthorized:false});
}
