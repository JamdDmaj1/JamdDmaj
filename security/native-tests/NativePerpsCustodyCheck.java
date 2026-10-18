package com.jamddmaj.ai.wallet;

/** Public chain snapshot only; no signing, secrets or transaction submission. */
public final class NativePerpsCustodyCheck {
    public static void main(String[] args){
        if(args.length!=5&&args.length!=25)throw new IllegalArgumentException("Expected custody identity/data and optional 20 same-custody opening roles");
        if(!"true".equals(args[3])&&!"false".equals(args[3]))throw new IllegalArgumentException("Invalid executable flag");
        NativePerpsCustody custody=NativePerpsCustody.decode(args[0],args[1],args[2],Boolean.parseBoolean(args[3]),java.util.Base64.getDecoder().decode(args[4]));
        if(args.length==25){
            byte[][] roles=new byte[20][];
            for(int i=0;i<20;i++)roles[i]=DevnetSolana.decode(args[5+i],32);
            custody.checkIncreaseAccounts(roles,custody);
        }
        System.out.println("CUSTODY="+custody.asset+" MINT="+custody.mint+" DECIMALS="+custody.decimals+" INCREASE_ALLOWED="+custody.allowIncrease+" MAX_LEVERAGE_BPS="+custody.maxLeverageBps+" DOVES_AG="+custody.dovesAgOracle+" OPENING_ROLES_CHECKED="+(args.length==25)+" SIGNING_AUTHORIZED=false");
    }
}
