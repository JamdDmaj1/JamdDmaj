import test from "node:test";
import assert from "node:assert/strict";
import { verifyPayment, DEVNET_MINT, DEVNET_TREASURY, PAYMENT_BASE_UNITS } from "../api/jamd-credit-topup.js";
import { grantPaidCredits, readPaidCredits } from "../lib/account-credits.js";

const signature="5".repeat(88), wallet="2RmDx5KLnEWG8wxdpdB6Z4ySDn9Z2Jir5aaCdg1ARCom";
function transaction(now=Math.floor(Date.now()/1000)) { return {blockTime:now,transaction:{signatures:[signature],message:{accountKeys:[{pubkey:wallet,signer:true}]}},meta:{err:null,
  preTokenBalances:[{mint:DEVNET_MINT,owner:wallet,uiTokenAmount:{amount:(100n*PAYMENT_BASE_UNITS).toString()}},{mint:DEVNET_MINT,owner:DEVNET_TREASURY,uiTokenAmount:{amount:"0"}}],
  postTokenBalances:[{mint:DEVNET_MINT,owner:wallet,uiTokenAmount:{amount:(99n*PAYMENT_BASE_UNITS).toString()}},{mint:DEVNET_MINT,owner:DEVNET_TREASURY,uiTokenAmount:{amount:PAYMENT_BASE_UNITS.toString()}}]}}; }

test("Devnet recharge requires an exact finalized JAMD transfer signed by the stated wallet",()=>{
  assert.equal(verifyPayment(transaction(),signature,wallet),true);
  const wrong=transaction();wrong.meta.postTokenBalances[1].uiTokenAmount.amount="1";
  assert.throws(()=>verifyPayment(wrong,signature,wallet),/amount/);
});

test("a payment grants credits only once",async()=>{
  let balance=0,used=false;
  const storage=async(_path,[command])=>{
    if(command[0]==="GET")return [{result:String(balance)}];
    if(command[0]==="EVAL") {if(!used){used=true;balance+=Number(command[5]);return [{result:[1,balance]}];}return [{result:[0,balance]}];}
  };
  const account="a".repeat(64);
  assert.deepEqual(await grantPaidCredits(account,"devnet:"+signature,20,storage),{created:true,credits:20});
  assert.deepEqual(await grantPaidCredits(account,"devnet:"+signature,20,storage),{created:false,credits:20});
  assert.equal(await readPaidCredits(account,storage),20);
});
