package com.jamddmaj.ai.wallet;

/** Public simulated account decoding only. Never signs or sends. */
public final class NativePerpsPositionCheck {
    public static void main(String[] args){
        if(args.length!=7)throw new IllegalArgumentException("Expected address, payer, asset, side, owner, executable, base64 account");
        if(!"true".equals(args[5])&&!"false".equals(args[5]))throw new IllegalArgumentException("Invalid account executable flag");
        NativePerpsPosition value=NativePerpsPosition.decode(args[0],args[4],Boolean.parseBoolean(args[5]),java.util.Base64.getDecoder().decode(args[6]),args[1],args[2],Integer.parseInt(args[3]));
        System.out.println("NATIVE_POSITION_MATCH=true SIZE_USD_UNITS="+value.sizeUsd+" COLLATERAL_USD_UNITS="+value.collateralUsd+" SIGNING_AUTHORIZED=false");
    }
}
