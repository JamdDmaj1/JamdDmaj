import test from "node:test";
import assert from "node:assert/strict";
import chat from "../api/chat.js";
import { issueTrialSession, authenticateTrial, trialHash } from "../lib/web-trial-session.js";
import { trialCopy } from "../web-trial-ui.js";
import { CONSUME_TRIAL_SCRIPT, REFUND_TRIAL_SCRIPT } from "../lib/trial-credits.js";
import { CONSUME_PAID_CREDIT_SCRIPT } from "../lib/account-credits.js";

test("opaque sessions resolve only a server-stored account", async () => {
  const account = await trialHash("google:test-user");
  assert.equal(account.length,64);
  const sessions=new Map();
  const storage=async (_,commands)=>commands.map(c=> {
    if(c[0]==="EVAL") return {result:JSON.stringify({status:"active",credits:20,startedAt:1,expiresAt:604801})};
    if(c[0]==="SET") {sessions.set(c[1],c[2]);return {result:"OK"};}
    return {result:sessions.get(c[1]) ?? null};
  });
  const session=await issueTrialSession(account,storage);
  assert.notEqual(session.token,account);
  assert.equal(await authenticateTrial(new Request("https://test",{headers:{Authorization:`Bearer ${session.token}`}}),storage),account);
  await assert.rejects(authenticateTrial(new Request("https://test",{headers:{Authorization:`Bearer ${account}`}}),storage));
});
test("trial labels exist in every supported language",()=>{
  assert.deepEqual(Object.keys(trialCopy).sort(),["ar","de","en","es","fr","it","ja","ko","pt","zh"]);
  for(const row of Object.values(trialCopy)) {assert.equal(row.length,6);assert.ok(row.every(Boolean));}
});
test("managed chat enforces session, quota and replay protection and refunds provider failures",async()=>{
  const originalFetch=globalThis.fetch;
  const env={...process.env};
  Object.assign(process.env,{OPENROUTER_API_KEY:"test",UPSTASH_REDIS_REST_URL:"https://redis.test",UPSTASH_REDIS_REST_TOKEN:"test"});
  let credits=20, calls=0, fail=false;
  const spent=new Map();
  globalThis.fetch=async(url, options)=>{
    if(String(url).includes("redis.test")) {
      const results=JSON.parse(options.body).map(c=>{
        if(c[0]==="GET") return {result:"a".repeat(64)};
        if(c[1]===CONSUME_TRIAL_SCRIPT){
          if(spent.has(c[4])) return {result:'{"status":"duplicate"}'};
          if(!credits)return {result:'{"status":"exhausted"}'};
          credits--;spent.set(c[4],true);return {result:JSON.stringify({status:"active",credits})};
        }
        if(c[1]===REFUND_TRIAL_SCRIPT){if(spent.get(c[4])===true){credits++;spent.set(c[4],false);return {result:1};}return {result:0};}
        if(c[1]===CONSUME_PAID_CREDIT_SCRIPT)return {result:'{"status":"exhausted"}'};
        return {result:[1,1,1,1,1]};
      });return Response.json(results);
    }
    calls++;
    assert.equal(JSON.parse(options.body).stream,false);
    return fail ? Response.json({error:{message:"failure"}},{status:503}) : Response.json({choices:[{message:{content:"Hello"}}]});
  };
  const request=(id,auth=true)=>new Request("https://www.jamddmaj.com/api/chat",{method:"POST",headers:{"x-jamddmaj-device":"device-1234567890123456",...(auth?{Authorization:`Bearer ${"b".repeat(64)}`}:{})},body:JSON.stringify({messages:[{role:"user",content:"hi"}],trialRequestId:id})});
  try {
    const id=crypto.randomUUID();
    assert.equal((await chat(request(id,false))).status,401);assert.equal(calls,0);
    const success=await chat(request(id));assert.equal(success.status,200);assert.match(await success.text(),/data:.*Hello/);assert.equal(credits,19);
    assert.equal((await chat(request(id))).status,403);assert.equal(calls,1);
    fail=true;assert.equal((await chat(request(crypto.randomUUID()))).status,503);assert.equal(credits,19);
    credits=0;assert.equal((await chat(request(crypto.randomUUID()))).status,403);assert.equal(calls,2);
  } finally {globalThis.fetch=originalFetch; for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
});
