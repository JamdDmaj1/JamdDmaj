import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64Decoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash
} from "@solana/kit";
import { getReleaseLiquidityInstruction } from "../lib/solana-devnet-token.js";

const RPC_URL = "https://api.devnet.solana.com";
const OWNER = "2RmDx5KLnEWG8wxdpdB6Z4ySDn9Z2Jir5aaCdg1ARCom";
const POLICY = "FuKZeMjTCFJRcYYfSxAa62EHM4sqx7RqH1SNTapUgc7r";
const LP_MINT = "3eCtggddS6WmQG3ACnbqoQF3wpB3WVEEH59yFYGoz25g";
const LOCK = "9MfHCJ73GyLE1afnjUsw77ucNYsWGj8X7stQYcMFzZGo";
const VAULT = "CTM56hMcmdzm4fX2aLQCmHAc2R6Cu35vJfM6zqn5J67a";
const DESTINATION = "4TmdqogJHqHVu75MqFaapNgnNkXrvxuUXpxqDBDRAkGT";
const WRONG_ACCOUNT = "Gdvhja25md5P4B9LpX5NSD1QmS32rTwTbLwqnkEdfTdB";

const rpc = createSolanaRpc(RPC_URL);
const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();

async function simulate(name, overrides, expectedLog) {
  const instruction = await getReleaseLiquidityInstruction({
    policyAddress: POLICY,
    beneficiaryAddress: OWNER,
    lpMintAddress: LP_MINT,
    liquidityLockAddress: LOCK,
    liquidityVaultAddress: VAULT,
    destinationAddress: DESTINATION,
    ...overrides
  });
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(OWNER, value),
    (value) => setTransactionMessageLifetimeUsingBlockhash(latest.value, value),
    (value) => appendTransactionMessageInstruction(instruction, value)
  );
  const transaction = compileTransaction(message);
  const response = await rpc.simulateTransaction(
    getBase64Decoder().decode(getTransactionEncoder().encode(transaction)),
    { encoding: "base64", sigVerify: false, commitment: "confirmed" }
  ).send();
  const logs = response.value.logs || [];
  if (!response.value.err) throw new Error(`${name}: simulation unexpectedly succeeded`);
  if (!logs.some((line) => line.includes(expectedLog))) {
    throw new Error(`${name}: expected ${expectedLog}; logs=${JSON.stringify(logs)}`);
  }
  return { name, rejected: true, expectedLog, error: response.value.err };
}

const results = [
  await simulate("early release", {}, "LiquidityStillLocked"),
  await simulate("substituted vault", { liquidityVaultAddress: WRONG_ACCOUNT }, "UninitializedAccount"),
  await simulate("wrong mint", { lpMintAddress: WRONG_ACCOUNT }, "ConstraintSeeds"),
  await simulate("wrong beneficiary", { beneficiaryAddress: WRONG_ACCOUNT }, "ConstraintSeeds")
];

console.log(JSON.stringify(
  { cluster: "devnet", sentTransactions: 0, results },
  (_, value) => typeof value === "bigint" ? value.toString() : value,
  2
));
