import {
  address, appendTransactionMessageInstructions, compileTransaction, createNoopSigner, createSolanaRpc,
  createTransactionMessage, getBase64Decoder, getBase58Decoder, getTransactionDecoder, getTransactionEncoder,
  pipe, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash
} from "@solana/kit";
import {
  TOKEN_2022_PROGRAM_ADDRESS, getCreateAssociatedTokenIdempotentInstructionAsync,
  getCreateAssociatedTokenInstructionAsync, getTransferCheckedInstruction
} from "@solana-program/token-2022";

export const CREDIT_DEVNET_CHAIN = "solana:devnet";
export const CREDIT_DEVNET_MINT = "3hGv2JJ8Hfktw5LMPoSN6R4enoAAZMPvPtS3TcwgGV61";
export const CREDIT_DEVNET_TREASURY = "4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr";
export const CREDIT_PAYMENT_BASE_UNITS = 10_000_000_000n;

export async function payForDevnetCredits(wallet,account) {
  const sign = wallet?.features?.["solana:signTransaction"];
  const signAndSend = wallet?.features?.["solana:signAndSendTransaction"];
  const versions = sign?.supportedTransactionVersions || signAndSend?.supportedTransactionVersions || [];
  if (!account?.address || (!sign?.signTransaction && !signAndSend?.signAndSendTransaction) || !versions.includes(0)) throw new Error("unsupported-wallet");
  const rpc = createSolanaRpc("https://api.devnet.solana.com");
  const owner = address(account.address), payer = createNoopSigner(owner), mint = address(CREDIT_DEVNET_MINT);
  const sourceInstruction = await getCreateAssociatedTokenInstructionAsync({payer,owner,mint,tokenProgram:TOKEN_2022_PROGRAM_ADDRESS});
  const source = sourceInstruction.accounts[1].address;
  const destinationInstruction = await getCreateAssociatedTokenIdempotentInstructionAsync({payer,owner:address(CREDIT_DEVNET_TREASURY),mint,tokenProgram:TOKEN_2022_PROGRAM_ADDRESS});
  const destination = destinationInstruction.accounts[1].address;
  const latest = await rpc.getLatestBlockhash({commitment:"confirmed"}).send();
  const message = pipe(createTransactionMessage({version:0}),
    value=>setTransactionMessageFeePayer(owner,value),
    value=>setTransactionMessageLifetimeUsingBlockhash(latest.value,value),
    value=>appendTransactionMessageInstructions([destinationInstruction,getTransferCheckedInstruction({source,mint,destination,authority:owner,amount:CREDIT_PAYMENT_BASE_UNITS,decimals:9})],value));
  const transaction = compileTransaction(message);
  const simulation = await rpc.simulateTransaction(getBase64Decoder().decode(getTransactionEncoder().encode(transaction)),{encoding:"base64",sigVerify:false,commitment:"confirmed"}).send();
  if (simulation.value.err) throw new Error("simulation-failed");
  if (sign?.signTransaction) {
    const [result] = await sign.signTransaction({account,chain:CREDIT_DEVNET_CHAIN,transaction:getTransactionEncoder().encode(transaction),options:{preflightCommitment:"confirmed"}});
    if (!result?.signedTransaction) throw new Error("signature-missing");
    const wire = getTransactionEncoder().encode(getTransactionDecoder().decode(result.signedTransaction));
    return String(await rpc.sendTransaction(getBase64Decoder().decode(wire),{encoding:"base64",skipPreflight:false,preflightCommitment:"confirmed",maxRetries:3}).send());
  }
  const [result] = await signAndSend.signAndSendTransaction({account,chain:CREDIT_DEVNET_CHAIN,transaction:getTransactionEncoder().encode(transaction),options:{commitment:"confirmed",preflightCommitment:"confirmed",maxRetries:3}});
  if (!result?.signature) throw new Error("signature-missing");
  return getBase58Decoder().decode(result.signature);
}
