import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressEncoder,
  getBase64Decoder,
  getBase58Decoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransactionWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash
} from "@solana/kit";
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { prepareDevnetMetadata } from "./devnet-token-metadata.js";
import {
  AuthorityType,
  TOKEN_2022_PROGRAM_ADDRESS,
  getCreateAssociatedTokenInstructionAsync,
  getInitializeMint2Instruction,
  getMintToCheckedInstruction,
  getSetAuthorityInstruction
} from "@solana-program/token-2022";

export const DEVNET_CHAIN = "solana:devnet";
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";
export const JAMDDMAJ_LOCK_PROGRAM_ADDRESS = "FzH2QN9NFFrpwsn8xqLT83BZ7ruqmMBiwY4CU6MkLVQ4";
export const JAMDDMAJ_PLATFORM_TREASURY = "4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr";
export const JAMDDMAJ_LAUNCH_FEE_LAMPORTS = 100_000_000n;
export const JAMDDMAJ_LAUNCH_FEE_SOL = 0.1;
const MAX_U64 = 18_446_744_073_709_551_615n;
const ZERO_ELIGIBILITY_ROOT = new Uint8Array(32);
const MIN_GOVERNANCE_DELAY_SECONDS = 2n * 86_400n;
const CREATOR_LOCK_BPS = 8_500n;

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
  await assertProtectionProgramAvailable(rpc);
  const ownerAddress = address(account.address);
  const payer = createNoopSigner(ownerAddress);
  const mint = await generateKeyPairSigner(false);
  const metadata = prepareDevnetMetadata(config, mint.address, payer);
  const mintSpace = metadata.mintSpace;
  const rent = await rpc.getMinimumBalanceForRentExemption(metadata.rentSpace).send();
  const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const tokenAccountInstruction = await getCreateAssociatedTokenInstructionAsync({
    payer,
    owner: ownerAddress,
    mint: mint.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS
  });
  const tokenAccountAddress = tokenAccountInstruction.accounts[1].address;
  const amount = getBaseUnits(config.totalSupply, config.decimals);
  const lockedAmount = divideRoundUp(amount * CREATOR_LOCK_BPS, 10_000n);
  const protectionAddresses = await deriveProtectionAddresses(mint.address, ownerAddress);
  const instructions = [
    getCreateAccountInstruction({
      payer,
      newAccount: mint,
      lamports: rent,
      space: mintSpace,
      programAddress: TOKEN_2022_PROGRAM_ADDRESS
    }),
    metadata.pointerInstruction,
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals: Number(config.decimals),
      mintAuthority: ownerAddress,
      freezeAuthority: null
    }),
    metadata.metadataInstruction,
    metadata.sealInstruction,
    tokenAccountInstruction,
    getMintToCheckedInstruction({
      mint: mint.address,
      token: tokenAccountAddress,
      mintAuthority: ownerAddress,
      amount,
      decimals: Number(config.decimals)
    }),
    await getInitializePolicyInstruction({
      ownerAddress,
      mintAddress: mint.address,
      policyAddress: protectionAddresses.policyAddress
    }),
    await getInitializeCreatorVestingInstruction({
      ownerAddress,
      mintAddress: mint.address,
      sourceAddress: tokenAccountAddress,
      policyAddress: protectionAddresses.policyAddress,
      vestingAddress: protectionAddresses.creatorVestingAddress,
      vaultAddress: protectionAddresses.creatorVaultAddress,
      totalAllocation: amount,
      lockedAmount
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
    throw new Error(`Devnet simulation failed: ${JSON.stringify(simulation.value.err, (_, value) => typeof value === "bigint" ? value.toString() : value)}`);
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
    policyAddress: String(protectionAddresses.policyAddress),
    creatorVestingAddress: String(protectionAddresses.creatorVestingAddress),
    creatorVaultAddress: String(protectionAddresses.creatorVaultAddress),
    signature,
    supply: Number(config.totalSupply),
    decimals: Number(config.decimals),
    creatorLockedAmount: lockedAmount.toString(),
    creatorLockBps: Number(CREATOR_LOCK_BPS),
    platformTreasury: JAMDDMAJ_PLATFORM_TREASURY,
    launchFeeLamports: JAMDDMAJ_LAUNCH_FEE_LAMPORTS.toString(),
    launchFeeSol: JAMDDMAJ_LAUNCH_FEE_SOL,
    participantEligibilityPending: true,
    mintAuthorityRevoked: true,
    freezeAuthority: null
  });
}

export async function checkDevnetProtectionProgram() {
  const rpc = createSolanaRpc(DEVNET_RPC_URL);
  const response = await rpc.getAccountInfo(address(JAMDDMAJ_LOCK_PROGRAM_ADDRESS), {
    commitment: "confirmed",
    encoding: "base64"
  }).send();
  return Object.freeze({
    available: response.value?.executable === true,
    programAddress: JAMDDMAJ_LOCK_PROGRAM_ADDRESS,
    cluster: DEVNET_CHAIN
  });
}

export async function deriveProtectionAddresses(mintAddress, beneficiaryAddress) {
  const programAddress = address(JAMDDMAJ_LOCK_PROGRAM_ADDRESS);
  const addressEncoder = getAddressEncoder();
  const policyAddress = (await getProgramDerivedAddress({
    programAddress,
    seeds: [new TextEncoder().encode("policy"), addressEncoder.encode(address(mintAddress))]
  }))[0];
  const creatorVestingAddress = (await getProgramDerivedAddress({
    programAddress,
    seeds: [
      new TextEncoder().encode("vesting"),
      addressEncoder.encode(policyAddress),
      addressEncoder.encode(address(beneficiaryAddress)),
      ZERO_ELIGIBILITY_ROOT
    ]
  }))[0];
  const creatorVaultAddress = (await getProgramDerivedAddress({
    programAddress,
    seeds: [new TextEncoder().encode("vault"), addressEncoder.encode(creatorVestingAddress)]
  }))[0];
  return Object.freeze({ policyAddress, creatorVestingAddress, creatorVaultAddress });
}

async function assertProtectionProgramAvailable(rpc) {
  const response = await rpc.getAccountInfo(address(JAMDDMAJ_LOCK_PROGRAM_ADDRESS), {
    commitment: "confirmed",
    encoding: "base64"
  }).send();
  if (response.value?.executable !== true) {
    throw new Error("El programa de proteccion JamdDmaj aun no esta activo en Devnet. No se creo ningun token.");
  }
}

export async function getInitializePolicyInstruction({ ownerAddress, mintAddress, policyAddress }) {
  return {
    programAddress: address(JAMDDMAJ_LOCK_PROGRAM_ADDRESS),
    accounts: [
      { address: ownerAddress, role: AccountRole.WRITABLE_SIGNER },
      { address: mintAddress, role: AccountRole.READONLY },
      { address: policyAddress, role: AccountRole.WRITABLE },
      { address: address(JAMDDMAJ_PLATFORM_TREASURY), role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY }
    ],
    data: concatBytes(
      await anchorDiscriminator("initialize_policy"),
      ZERO_ELIGIBILITY_ROOT,
      encodeI64(MIN_GOVERNANCE_DELAY_SECONDS)
    )
  };
}

export async function getInitializeCreatorVestingInstruction({
  ownerAddress,
  mintAddress,
  sourceAddress,
  policyAddress,
  vestingAddress,
  vaultAddress,
  totalAllocation,
  lockedAmount
}) {
  return {
    programAddress: address(JAMDDMAJ_LOCK_PROGRAM_ADDRESS),
    accounts: [
      { address: policyAddress, role: AccountRole.WRITABLE },
      { address: ownerAddress, role: AccountRole.WRITABLE_SIGNER },
      { address: ownerAddress, role: AccountRole.READONLY },
      { address: mintAddress, role: AccountRole.READONLY },
      { address: mintAddress, role: AccountRole.READONLY },
      { address: vestingAddress, role: AccountRole.WRITABLE },
      { address: vaultAddress, role: AccountRole.WRITABLE },
      { address: sourceAddress, role: AccountRole.WRITABLE },
      { address: ownerAddress, role: AccountRole.READONLY_SIGNER },
      { address: TOKEN_2022_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY }
    ],
    data: concatBytes(
      await anchorDiscriminator("initialize_creator_vesting"),
      encodeU64(totalAllocation),
      encodeU64(lockedAmount)
    )
  };
}

async function anchorDiscriminator(name) {
  const input = new TextEncoder().encode(`global:${name}`);
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", input)).slice(0, 8);
}

function encodeU64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function encodeI64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
  return bytes;
}

function concatBytes(...values) {
  const output = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function divideRoundUp(value, divisor) {
  return (value + divisor - 1n) / divisor;
}

function getBaseUnits(supply, decimals) {
  return BigInt(Math.trunc(Number(supply))) * (10n ** BigInt(Number(decimals)));
}
