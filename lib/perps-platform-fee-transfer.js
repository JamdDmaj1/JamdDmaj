// A separately reviewed USDC instruction, NEVER appended to Jupiter's signed
// message. No generic recipient, amount, signer or submission API is accepted.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PLATFORM_FEE,quotePerpsPlatformFee} from './perps-platform-fee.js';
import {readPerpsPlatformFeeAssessment} from './perps-platform-fee-journal.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
function fail(){throw Error('PLATFORM_FEE_TRANSFER_NOT_AUTHORIZED');}
export async function planPerpsPlatformFeeTransfer(assessment){
  readPerpsPlatformFeeAssessment(assessment);
  const quote=quotePerpsPlatformFee(assessment.margin);
  if(assessment.state!=='AWAITING_PAYMENT_REVIEW'||assessment.fee!==quote.feeUnits
    ||assessment.terms!==JSON.stringify(quote)||assessment.wallet===quote.recipient)fail();
  const derive=async wallet=>(await getProgramDerivedAddress({programAddress:ATA,
    seeds:[bs58.decode(wallet),bs58.decode(TOKEN),bs58.decode(quote.mint)]}))[0];
  const [source,destination]=await Promise.all([derive(assessment.wallet),derive(quote.recipient)]);
  readPerpsPlatformFeeAssessment(assessment);
  const data=Buffer.alloc(10);data[0]=12;data.writeBigUInt64LE(BigInt(quote.feeUnits),1);data[9]=6;
  return Object.freeze({stage:'PLATFORM_FEE_TRANSFER_PLAN_ONLY',assessmentId:assessment.id,
    walletAddress:assessment.wallet,recipient:PERPS_PLATFORM_FEE.recipient,mint:quote.mint,
    feeUnits:quote.feeUnits,token:'USDC',network:'solana-mainnet',
    instruction:Object.freeze({program:TOKEN,accounts:Object.freeze([
      Object.freeze({address:source,signer:false,writable:true}),
      Object.freeze({address:quote.mint,signer:false,writable:false}),
      Object.freeze({address:destination,signer:false,writable:true}),
      Object.freeze({address:assessment.wallet,signer:true,writable:false})
    ]),dataBase64:data.toString('base64')}),
    readyForSigning:false,requiresFreshTokenAccounts:true,requiresFreshFeeAndBalanceCheck:true,
    requiresSimulation:true,requiresSeparateOwnerApproval:true,requiresDurablePaymentJournal:true,
    networkSponsorshipAvailable:false});
}
