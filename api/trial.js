import { corsHeaders, jsonResponse } from "../lib/server.js";
import { authenticateTrial } from "../lib/web-trial-session.js";
import { claimWebTrial } from "../lib/trial-credits.js";
import { readPaidCredits } from "../lib/account-credits.js";
export const config = { runtime: "edge" };
export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request)});
  if (request.method !== "GET") return jsonResponse(request,{error:{code:"method"}},405);
  try {
    const account = await authenticateTrial(request);
    const [trial,paidCredits] = await Promise.all([claimWebTrial(account),readPaidCredits(account)]);
    return jsonResponse(request,{trial,paidCredits});
  }
  catch (error) { return jsonResponse(request,{error:{code:error.status===401?"trial-login":"trial-unavailable"}},error.status===401?401:503); }
}
