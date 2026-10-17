package com.jamddmaj.ai.wallet;

/** Public chain snapshot only; no signing, secrets or transaction submission. */
public final class NativePerpsCustodyCheck {
    public static void main(String[] args){
        if(args.length!=5)throw new IllegalArgumentException("Expected asset, address, owner, executable and base64 data");
        if(!"true".equals(args[3])&&!"false".equals(args[3]))throw new IllegalArgumentException("Invalid executable flag");
        NativePerpsCustody custody=NativePerpsCustody.decode(args[0],args[1],args[2],Boolean.parseBoolean(args[3]),java.util.Base64.getDecoder().decode(args[4]));
        System.out.println("CUSTODY="+custody.asset+" MINT="+custody.mint+" DECIMALS="+custody.decimals+" INCREASE_ALLOWED="+custody.allowIncrease+" MAX_LEVERAGE_BPS="+custody.maxLeverageBps+" SIGNING_AUTHORIZED=false");
    }
}
