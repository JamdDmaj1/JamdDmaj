// Reconcile a fresh finalized receipt with a private durable signed intent.
// This is not a reservation, custody grant or permission to open a position.
import {createHash} from 'node:crypto';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {readConstructedPerpsEntryConversionWire} from './perps-entry-conversion-wire.js';
import {requireVerifiedPerpsEntryConversionReceipt} from './perps-close-conversion-receipt.js';
const bindings=new WeakMap(),hash=b=>createHash('sha256').update(b).digest('hex');
function fail(){throw Error('UNVERIFIED_PERPS_ENTRY_CONVERSION_BINDING');}
export function bindFinalizedPerpsEntryConversion({journal,id,ownerAccountHash,wire,receipt}){
 requireBotSwapJournal(journal);readConstructedPerpsEntryConversionWire(wire);requireVerifiedPerpsEntryConversionReceipt(receipt);
 const row=journal.read(id);if(!row||row.owner!==ownerAccountHash||!['UNKNOWN','FINALIZED'].includes(row.state))fail();
 const review=JSON.parse(row.review),signed=Buffer.from(row.signed,'base64');
 if(review.stage!=='PROTECTED_ENTRY_CONVERSION_PREPARED'||review.maxSlippageBps!==50
  ||review.draft?.side!=='LONG'||review.draft.asset!==wire.asset||review.usdcUnits!==wire.usdcUnits
  ||review.minimumCollateralUnits!==wire.minimumCollateralUnits||review.collateralMint!==receipt.collateralMint
  ||review.collateralDecimals!==receipt.collateralDecimals||row.wallet!==wire.walletAddress
  ||row.message!==wire.messageBase64||row.signature!==receipt.signature||hash(signed)!==receipt.wireHash
  ||hash(Buffer.from(wire.serializedTxBase64,'base64'))!==receipt.unsignedWireHash
  ||receipt.walletAddress!==row.wallet||receipt.asset!==wire.asset||receipt.spentUsdcUnits!==wire.usdcUnits
  ||receipt.minimumCollateralUnits!==wire.minimumCollateralUnits||receipt.collateralAccount!==wire.destination
  ||receipt.slot<review.observedSlot||receipt.blockTime*1000<row.created-2000
  ||receipt.networkFeeLamports!==review.networkFeeLamports)fail();
 const result=Object.freeze({stage:'JOURNAL_BOUND_ENTRY_COLLATERAL_ONLY',readyForSigning:false,tradingEnabled:false,
  id:row.id,walletAddress:row.wallet,asset:wire.asset,signature:receipt.signature,wireHash:receipt.wireHash,
  spentUsdcUnits:receipt.spentUsdcUnits,receivedCollateralUnits:receipt.receivedCollateralUnits,
  collateralMint:receipt.collateralMint,collateralAccount:receipt.collateralAccount,slot:receipt.slot,
  requiresDurableEntryReservation:true,requiresSeparateOpeningAuthorization:true});
 bindings.set(result,{journal,id,ownerAccountHash,wire,receipt});return result;
}
export function readBoundPerpsEntryCollateral(value){
 const p=bindings.get(value);if(!p)fail();requireVerifiedPerpsEntryConversionReceipt(p.receipt);
 const current=bindFinalizedPerpsEntryConversion(p);
 if(JSON.stringify(current)!==JSON.stringify(value))fail();return value;
}
