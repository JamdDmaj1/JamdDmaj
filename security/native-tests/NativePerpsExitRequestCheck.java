package com.jamddmaj.ai.wallet;

/** Public, unsigned simulation diagnostic. Never loads keys or sends orders. */
public final class NativePerpsExitRequestCheck {
    public static void main(String[] args){
        if(args.length!=8)throw new IllegalArgumentException("Expected public request identity, payer, market, side, owner, executable, state and instruction");
        NativePerpsExitRequest request=NativePerpsExitRequest.check(args[0],args[4],Boolean.parseBoolean(args[5]),java.util.Base64.getDecoder().decode(args[6]),
            args[1],args[2],Integer.parseInt(args[3]),NativePerpsInstructionData.parse(java.util.Base64.getDecoder().decode(args[7])));
        System.out.println("NATIVE_EXIT_MATCH=true SIZE_USD_UNITS="+request.sizeUsd+" TRIGGER_USD_UNITS="+request.triggerPrice+" ABOVE="+request.triggerAbove+" SIGNING_AUTHORIZED=false");
    }
}
