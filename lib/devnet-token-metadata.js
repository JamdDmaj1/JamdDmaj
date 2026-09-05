import { extension, getMintSize, getInitializeMetadataPointerInstruction, getInitializeTokenMetadataInstruction, getUpdateTokenMetadataUpdateAuthorityInstruction } from "@solana-program/token-2022";

// No off-chain claims or mutable URLs: this first test stores identity on the mint.
export function prepareDevnetMetadata(config, mint, payer) {
  const name = String(config.projectName || "").trim();
  const symbol = String(config.symbol || "").trim();
  const bytes = value => new TextEncoder().encode(value).length;
  if (!name || !symbol || bytes(name) > 128 || bytes(symbol) > 32 || /[\u0000-\u001f\u007f]/.test(name + symbol)) {
    throw new Error("Invalid token metadata");
  }
  const pointer = extension("MetadataPointer", { authority: null, metadataAddress: mint });
  const metadata = extension("TokenMetadata", {
    updateAuthority: null, mint, name, symbol, uri: "", additionalMetadata: new Map()
  });
  return {
    mintSpace: BigInt(getMintSize([pointer])),
    rentSpace: BigInt(getMintSize([pointer, metadata])),
    pointerInstruction: getInitializeMetadataPointerInstruction({ mint, authority: null, metadataAddress: mint }),
    metadataInstruction: getInitializeTokenMetadataInstruction({
      metadata: mint, updateAuthority: payer.address, mint, mintAuthority: payer,
      name, symbol, uri: ""
    }),
    sealInstruction: getUpdateTokenMetadataUpdateAuthorityInstruction({
      metadata: mint, updateAuthority: payer, newUpdateAuthority: null
    })
  };
}
