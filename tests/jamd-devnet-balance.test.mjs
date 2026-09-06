import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { readJamdDevnetBalance, JAMD_DEVNET as c } from "../lib/jamd-devnet-balance.js";
import { JAMD_LAB_COPY } from "../lib/jamd-lab-copy.js";
import { WALLET_LOGIN_LOCALES } from "../lib/wallet-login-locales.js";
import { trialKeys, claimTrial, TRIAL_CREDITS, TRIAL_SECONDS } from "../lib/trial-credits.js";
const owner = "2RmDx5KLnEWG8wxdpdB6Z4ySDn9Z2Jir5aaCdg1ARCom";
const tokenProgram = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
test("the existing JAMD mint remains bound to its immutable version-1 program", () => {
  assert.equal(c.program, "BZMa3Aubxg1K3yx6oSN2nCnUcSJw6t7y55yCe7nZvx9V");
});
function binaryAccount(bytes, program) { return { owner: program, data: [bytes.toString("base64"), "base64"] }; }
function fixtures() {
  const vesting = Buffer.alloc(187);
  createHash("sha256").update("account:VestingVault").digest().copy(vesting, 0, 0, 8);
  for (const [offset, key] of [[8,c.policy],[40,owner],[72,c.mint]]) Buffer.from(bs58.decode(key)).copy(vesting, offset);
  vesting.writeBigUInt64LE(1000000000000000000n,104);
  vesting.writeBigUInt64LE(850000000000000000n,112);
  const vault = Buffer.alloc(165);
  Buffer.from(bs58.decode(c.mint)).copy(vault,0);
  Buffer.from(bs58.decode(c.vesting)).copy(vault,32);
  vault.writeBigUInt64LE(850000000000000000n,64);
  return [binaryAccount(vesting,c.program), binaryAccount(vault,tokenProgram)];
}
function fetcher(protection, address=owner) {
  return async (url, options) => {
    assert.equal(url,"https://api.devnet.solana.com");
    const input=JSON.parse(options.body);
    const value=input.method==="getMultipleAccounts"?protection:[{account:{owner:tokenProgram,data:{parsed:{info:{
      owner:address,mint:c.mint,state:"initialized",tokenAmount:{amount:"150000000000000000"}
    }}}}}];
    return new Response(JSON.stringify({result:{value}}));
  };
}
test("Jamd reports exact available and vested balances separately",async()=>{
  const result=await readJamdDevnetBalance(owner,fetcher(fixtures()));
  assert.equal(result.availableBaseUnits,"150000000000000000");
  assert.equal(result.vestingBaseUnits,"850000000000000000");
  assert.equal(result.metadataSource,"app-registry");
  assert.equal(result.mint,"3hGv2JJ8Hfktw5LMPoSN6R4enoAAZMPvPtS3TcwgGV61");
  assert.equal(result.name,"JamdDmaj");
});

test("old Devnet token cannot be counted as the current token", async () => {
  const fetchCurrent = fetcher(fixtures());
  await assert.rejects(readJamdDevnetBalance(owner, async (url, options) => {
    const response = await fetchCurrent(url, options);
    const body = await response.json();
    if (JSON.parse(options.body).method === "getTokenAccountsByOwner") {
      body.result.value[0].account.data.parsed.info.mint = "5uYzXBoGBrBCPFLqvEzGH8Aab4MNPKKPTcunZa7Q4aWH";
    }
    return new Response(JSON.stringify(body));
  }), /invalid-token-account/);
});
test("another wallet never inherits creator vesting",async()=>{
  const result=await readJamdDevnetBalance(c.program,fetcher(fixtures(),c.program));
  assert.equal(result.vestingBaseUnits,"0");
});
test("substituted vault authority and missing collateral fail closed",async()=>{
  for (const offset of [32,64]) {
    const data=fixtures();const bytes=Buffer.from(data[1].data[0],"base64");
    bytes.fill(0,offset,offset===32?64:72);data[1].data[0]=bytes.toString("base64");
    await assert.rejects(readJamdDevnetBalance(owner,fetcher(data)),/invalid-protection/);
  }
});
test("all wallet locales have complete Jamd balance labels",()=>{
  assert.deepEqual(Object.keys(JAMD_LAB_COPY).sort(),[...WALLET_LOGIN_LOCALES].sort());
  for(const copy of Object.values(JAMD_LAB_COPY)){
    assert.deepEqual(Object.keys(copy),Object.keys(JAMD_LAB_COPY.en));
    assert.ok(Object.values(copy).every(value=>typeof value==="string"&&value.length>0));
  }
});
test("trial requires native verification rather than client device IDs",()=>{
  assert.equal(TRIAL_CREDITS,20);assert.equal(TRIAL_SECONDS,604800);
  assert.throws(()=>trialKeys({accountHash:"a".repeat(64),deviceHash:"b".repeat(64)}));
  assert.throws(()=>trialKeys({attestationVerified:true,provider:"browser-fingerprint"}));
});
test("trial storage failures do not grant credits",async()=>{
  await assert.rejects(claimTrial({accountHash:"a".repeat(64),deviceHash:"b".repeat(64),
    attestationVerified:true,provider:"apple-devicecheck"},async()=>[{error:"unavailable"}]));
});
