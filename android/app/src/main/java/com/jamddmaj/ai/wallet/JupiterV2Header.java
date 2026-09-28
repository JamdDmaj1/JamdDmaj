package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Decodes the fixed monetary fields of route_v2/shared_accounts_route_v2.
 * This is NOT full route validation or permission to sign. Account ownership,
 * route instructions, setup/cleanup, fees and simulation still need validation.
 * Layout reference: carbon-jupiter-swap-decoder instructions/{route_v2,shared_accounts_route_v2}.
 */
public final class JupiterV2Header {
    public static final String PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    private static final byte[] ROUTE = {(byte)187,100,(byte)250,(byte)204,49,(byte)196,(byte)175,20};
    private static final byte[] SHARED = {(byte)209,(byte)152,83,(byte)147,124,(byte)254,(byte)216,(byte)233};
    public final boolean sharedAccounts;
    public final int authorityId, slippageBps, platformFeeBps, positiveSlippageBps, routeSteps;
    public final BigInteger inputAmount, quotedOutput;
    private final byte[] data;
    private JupiterV2Header(byte[] source) {
        data = source;
        byte[] discriminator = Arrays.copyOf(source,8);
        sharedAccounts = Arrays.equals(discriminator,SHARED);
        if (!sharedAccounts && !Arrays.equals(discriminator,ROUTE)) throw invalid();
        int start = sharedAccounts ? 9 : 8;
        if (source.length < start + 26) throw invalid();
        authorityId = sharedAccounts ? source[8] & 255 : -1;
        inputAmount = uint(source,start,8); quotedOutput = uint(source,start+8,8);
        slippageBps = uint(source,start+16,2).intValue();
        platformFeeBps = uint(source,start+18,2).intValue();
        positiveSlippageBps = uint(source,start+20,2).intValue();
        BigInteger steps = uint(source,start+22,4);
        if (inputAmount.signum()==0 || quotedOutput.signum()==0 || slippageBps>10000
                || platformFeeBps>10000 || positiveSlippageBps>10000 || steps.signum()==0 || steps.compareTo(BigInteger.valueOf(64))>0) throw invalid();
        routeSteps = steps.intValue();
        // Each RoutePlanStepV2 needs at least an enum tag, bps and two indexes.
        if (source.length - start - 26 < routeSteps * 5) throw invalid();
    }
    public static JupiterV2Header parse(String programId,byte[] data) {
        if (!PROGRAM.equals(programId) || data==null || data.length<8 || data.length>1232) throw invalid();
        return new JupiterV2Header(data.clone());
    }
    public byte[] bytes() { return data.clone(); }
    public BigInteger minimumOutputWithoutFees() {
        if (platformFeeBps!=0 || positiveSlippageBps!=0) throw new IllegalArgumentException("Fees require separate swap review support");
        return quotedOutput.multiply(BigInteger.valueOf(10000-slippageBps)).add(BigInteger.valueOf(9999)).divide(BigInteger.valueOf(10000));
    }
    public void requireIntent(BigInteger input,BigInteger quoted,BigInteger minimum,int allowedSlippage) {
        if (allowedSlippage<1 || allowedSlippage>500 || allowedSlippage!=slippageBps || !inputAmount.equals(input)
                || !quotedOutput.equals(quoted) || !minimumOutputWithoutFees().equals(minimum) || minimum.signum()<=0)
            throw new IllegalArgumentException("Swap amounts differ from reviewed intent");
    }
    private static BigInteger uint(byte[] bytes,int offset,int size) {
        byte[] reversed=new byte[size];for(int i=0;i<size;i++)reversed[size-1-i]=bytes[offset+i];return new BigInteger(1,reversed);
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid or unsupported Jupiter route header"); }
}
