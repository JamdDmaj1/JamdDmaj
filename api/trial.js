import { corsHeaders, jsonResponse } from "../lib/server.js";
import { authenticateTrial } from "../lib/web-trial-session.js";
import { claimWebTrial } from "../lib/trial-credits.js";
export const config = { runtime: "edge" };
export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders(request)});
  if (request.method !== "GET") return jsonResponse(request,{error:{code:"method"}},405);
  try { return jsonResponse(request,{trial:await claimWebTrial(await authenticateTrial(request))}); }
  catch (error) { return jsonResponse(request,{error:{code:error.status===401?"trial-login":"trial-unavailable"}},error.status===401?401:503); }
}
