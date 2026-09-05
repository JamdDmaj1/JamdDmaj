import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { address, createNoopSigner } from "@solana/kit";
import { parseInitializeMetadataPointerInstruction } from "@solana-program/token-2022";
import { prepareDevnetMetadata } from "../lib/devnet-token-metadata.js";

const mint = address("5uYzXBoGBrBCPFLqvEzGH8Aab4MNPKKPTcunZa7Q4aWH");
const payer = createNoopSigner(address("2RmDx5KLnEWG8wxdpdB6Z4ySDn9Z2Jir5aaCdg1ARCom"));
// Independent wire decoder: the SDK's generated metadata decoder consumes the
// entire payload as its variable-size discriminator in version 0.9.0.
function parseInitializeTokenMetadataInstruction(instruction) {
  const bytes = instruction.data;
  assert.deepEqual([...bytes.slice(0, 8)], [210, 225, 30, 162, 88, 184, 77, 141]);
  let offset = 8;
  const read = () => {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    const value = new TextDecoder().decode(bytes.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const data = { name: read(), symbol: read(), uri: read() };
  assert.equal(offset, bytes.length);
  return { data, accounts: { metadata: instruction.accounts[0], updateAuthority: instruction.accounts[1] } };
}
test("metadata stores configured identity and funds its extension before resizing", () => {
  const value = prepareDevnetMetadata({ projectName: "Jamd", symbol: "JAMD" }, mint, payer);
  const parsed = parseInitializeTokenMetadataInstruction(value.metadataInstruction);
  assert.equal(parsed.data.name, "Jamd");
  assert.equal(parsed.data.symbol, "JAMD");
  assert.equal(parsed.accounts.metadata.address, mint);
  assert.equal(parsed.accounts.updateAuthority.address, payer.address);
  assert.equal(value.sealInstruction.data.length, 40);
  assert.ok([...value.sealInstruction.data.slice(8)].every(byte => byte === 0));
  assert.ok(value.rentSpace > value.mintSpace);
  const pointer = parseInitializeMetadataPointerInstruction(value.pointerInstruction);
  assert.equal(pointer.data.authority.__option, "None");
  assert.equal(pointer.data.metadataAddress.value, mint);
  const other = prepareDevnetMetadata({ projectName: "Otro proyecto", symbol: "OTRO" }, mint, payer);
  assert.equal(parseInitializeTokenMetadataInstruction(other.metadataInstruction).data.symbol, "OTRO");
});
test("invalid metadata is rejected before wallet approval", () => {
  for (const projectName of ["", "x".repeat(129), "bad\nname", "界".repeat(50)]) {
    assert.throws(() => prepareDevnetMetadata({ projectName, symbol: "JAMD" }, mint, payer));
  }
});
test("metadata initialization precedes mint revocation and keeps simulation mandatory", async () => {
  const source = await readFile(new URL("../lib/solana-devnet-token.js", import.meta.url), "utf8");
  assert.ok(source.indexOf("metadata.pointerInstruction") < source.indexOf("getInitializeMint2Instruction({"));
  assert.ok(source.indexOf("metadata.metadataInstruction") < source.indexOf("authorityType: AuthorityType.MintTokens"));
  assert.ok(source.indexOf("metadata.sealInstruction") > source.indexOf("metadata.metadataInstruction"));
  assert.ok(source.indexOf("metadata.sealInstruction") < source.indexOf("authorityType: AuthorityType.MintTokens"));
  assert.ok(source.indexOf("rpc.simulateTransaction") < source.indexOf("await signFeature.signTransaction"));
  assert.match(source, /CREATOR_LOCK_BPS = 8_500n/);
});
