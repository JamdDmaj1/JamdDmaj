import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64Decoder,
  getBase58Decoder,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransactionWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  AuthorityType,
  TOKEN_2022_PROGRAM_ADDRESS,
  getCreateAssociatedTokenInstructionAsync,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToCheckedInstruction,
  getSetAuthorityInstruction
} from "@solana-program/token-2022";

export const DEVNET_CHAIN = "solana:devnet";
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const MAX_U64 = 18_446_744_073_709_551_615n;

export function validateDevnetTokenRequest(config, wallet, account) {
  const errors = [];
  if (!wallet || !account) errors.push("Conecta una wallet Solana.");
  const signFeature = wallet?.features?.["solana:signTransaction"];
  const sendFeature = wallet?.features?.["solana:signAndSendTransaction"];
  if (!signFeature?.signTransaction && !sendFeature?.signAndSendTransaction) {
    errors.push("La wallet no permite firmar transacciones Solana desde esta app.");
  }
  const versions = signFeature?.supportedTransactionVersions || sendFeature?.supportedTransactionVersions || [];
  if (!versions.includes(0)) errors.push("La wallet no admite transacciones Solana v0.");
  const decimals = Number(config?.decimals);
  const supply = Number(config?.totalSupply);
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 9) errors.push("Devnet admite de 0 a 9 decimales en este laboratorio.");
  if (!Number.isSafeInteger(supply) || supply < 1) errors.push("El suministro debe ser un numero entero seguro.");
  if (errors.length === 0 && getBaseUnits(supply, decimals) > MAX_U64) errors.push("El suministro excede el limite tecnico de Token-2022.");
  if (config?.network !== "solana-token-2022") errors.push("La creacion de prueba solo esta habilitada para Solana Token-2022.");
  if (config?.revokeMintAuthority !== true) errors.push("Activa la revocacion de autoridad de emision.");
  if (config?.disableFreezeAuthority !== true) errors.push("La autoridad de congelacion debe quedar desactivada.");
  return errors;
}

export async function createFixedSupplyTokenOnDevnet({ config, wallet, account }) {
  const errors = validateDevnetTokenRequest(config, wallet, account);
  if (errors.length) throw new Error(errors[0]);

  const rpc = createSolanaRpc(DEVNET_RPC_URL);
  const ownerAddress = address(account.address);
  const payer = createNoopSigner(ownerAddress);
  const mint = await generateKeyPairSigner(false);
  const mintSpace = BigInt(getMintSize());
  const rent = await rpc.getMinimumBalanceForRentExemption(mintSpace).send();
  const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const tokenAccountInstruction = await getCreateAssociatedTokenInstructionAsync({
    payer,
    owner: ownerAddress,
    mint: mint.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS
  });
  const tokenAccountAddress = tokenAccountInstruction.accounts[1].address;
  const amount = getBaseUnits(config.totalSupply, config.decimals);
  const instructions = [
    getCreateAccountInstruction({
      payer,
      newAccount: mint,
      lamports: rent,
      space: mintSpace,
      programAddress: TOKEN_2022_PROGRAM_ADDRESS
    }),
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals: Number(config.decimals),
      mintAuthority: ownerAddress,
      freezeAuthority: null
    }),
    tokenAccountInstruction,
    getMintToCheckedInstruction({
      mint: mint.address,
      token: tokenAccountAddress,
      mintAuthority: ownerAddress,
      amount,
      decimals: Number(config.decimals)
    }),
    getSetAuthorityInstruction({
      owned: mint.address,
      owner: ownerAddress,
      authorityType: AuthorityType.MintTokens,
      newAuthority: null
    })
  ];
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(ownerAddress, value),
    (value) => setTransactionMessageLifetimeUsingBlockhash(latest.value, value),
    (value) => appendTransactionMessageInstructions(instructions, value)
  );
  const compiled = compileTransaction(message);
  const mintSignedForSimulation = await partiallySignTransactionWithSigners([mint], compiled);
  const simulationBytes = getTransactionEncoder().encode(mintSignedForSimulation);
  const simulation = await rpc.simulateTransaction(
    getBase64Decoder().decode(simulationBytes),
    { encoding: "base64", sigVerify: false, commitment: "confirmed" }
  ).send();
  if (simulation.value.err) {
    throw new Error(`Devnet simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }

  let signature;
  const signFeature = wallet.features["solana:signTransaction"];
  if (signFeature?.signTransaction) {
    // Phantom recommends signing with the wallet first when a transaction has
    // additional signers. The temporary mint key is added only afterwards.
    const unsignedBytes = getTransactionEncoder().encode(compiled);
    const [walletResult] = await signFeature.signTransaction({
      account,
      chain: DEVNET_CHAIN,
      transaction: unsignedBytes,
      options: { preflightCommitment: "confirmed" }
    });
    if (!walletResult?.signedTransaction) throw new Error("La wallet no devolvio la transaccion firmada.");
    const walletSigned = getTransactionDecoder().decode(walletResult.signedTransaction);
    const fullySigned = await partiallySignTransactionWithSigners([mint], walletSigned);
    const wireBytes = getTransactionEncoder().encode(fullySigned);
    signature = await rpc.sendTransaction(getBase64Decoder().decode(wireBytes), {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3
    }).send();
  } else {
    // Compatibility fallback for wallets that only expose sign-and-send.
    const transaction = getTransactionEncoder().encode(mintSignedForSimulation);
    const [result] = await wallet.features["solana:signAndSendTransaction"].signAndSendTransaction({
      account,
      chain: DEVNET_CHAIN,
      transaction,
      options: { commitment: "confirmed", preflightCommitment: "confirmed", maxRetries: 3 }
    });
    if (!result?.signature) throw new Error("La wallet no devolvio una firma de transaccion.");
    signature = getBase58Decoder().decode(result.signature);
  }
  if (!signature) throw new Error("La red no devolvio una firma de transaccion.");
  return Object.freeze({
    chain: DEVNET_CHAIN,
    mintAddress: String(mint.address),
    tokenAccountAddress: String(tokenAccountAddress),
    signature,
    supply: Number(config.totalSupply),
    decimals: Number(config.decimals),
    mintAuthorityRevoked: true,
    freezeAuthority: null
  });
}

function getBaseUnits(supply, decimals) {
  return BigInt(Math.trunc(Number(supply))) * (10n ** BigInt(Number(decimals)));
}
