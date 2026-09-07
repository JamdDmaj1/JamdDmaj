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
import { getClaimVestedInstruction } from "../lib/solana-devnet-token.js";

const RPC_URL = "https://api.devnet.solana.com";
const OWNER = "2RmDx5KLnEWG8wxdpdB6Z4ySDn9Z2Jir5aaCdg1ARCom";
const POLICY = "FuKZeMjTCFJRcYYfSxAa62EHM4sqx7RqH1SNTapUgc7r";
const MINT = "Gdvhja25md5P4B9LpX5NSD1QmS32rTwTbLwqnkEdfTdB";
const VESTING = "GnWU8WJbTCHC3tx5xGSWwQ7TWExHkrzENvZf4rW72SWd";
const VAULT = "BLkpfU6mkdD72RcDwP7fdgW3VknsMdMfzUAtD8iv7hZj";
const DESTINATION = "2aH5uHjXMN3SzDyHSHCoMycTcbcw8rT6CMf8wq4Z6TcT";
const WRONG_MINT = "3eCtggddS6WmQG3ACnbqoQF3wpB3WVEEH59yFYGoz25g";
const WRONG_TOKEN_ACCOUNT = "4TmdqogJHqHVu75MqFaapNgnNkXrvxuUXpxqDBDRAkGT";

const rpc = createSolanaRpc(RPC_URL);
const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();

async function simulate(name, overrides, expectedLogs) {
  const instruction = await getClaimVestedInstruction({
    policyAddress: POLICY,
    beneficiaryAddress: OWNER,
    mintAddress: MINT,
    vestingAddress: VESTING,
    vaultAddress: VAULT,
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
  const matchedLog = expectedLogs.find((expected) => logs.some((line) => line.includes(expected)));
  if (!matchedLog) throw new Error(`${name}: expected ${expectedLogs.join(" or ")}; logs=${JSON.stringify(logs)}`);
  return { name, rejected: true, expectedLog: matchedLog, error: response.value.err };
}

const results = [
  await simulate("claim before cliff", {}, ["NothingToClaim"]),
  await simulate("substituted vault", { vaultAddress: WRONG_TOKEN_ACCOUNT }, ["ConstraintSeeds", "ConstraintTokenOwner", "ConstraintTokenMint"]),
  await simulate("wrong mint", { mintAddress: WRONG_MINT }, ["ConstraintHasOne", "ConstraintSeeds"]),
  await simulate("wrong beneficiary", { beneficiaryAddress: MINT }, ["ConstraintHasOne", "ConstraintSeeds"]),
  await simulate("wrong destination mint", { destinationAddress: WRONG_TOKEN_ACCOUNT }, ["ConstraintTokenMint"])
];

console.log(JSON.stringify(
  { cluster: "devnet", sentTransactions: 0, results },
  (_, value) => typeof value === "bigint" ? value.toString() : value,
  2
));
