package com.jamddmaj.ai.wallet;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Disposable public address, independently derived with Solana Kit. No network calls. */
@RunWith(AndroidJUnit4.class)
public class TokenAddressTest {
    private static final String OWNER="2btLJAAb1S3x6hZYdVyAePjqtQYi2ZBSRGy4569RZu8h";
    private static final String SOL="So11111111111111111111111111111111111111112";
    private static final String USDC="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    @Test public void associatedAccountsMatchIndependentKitVectors() {
        assertEquals("EDcBS3Pm3ESXqZKqjFXmqKb5XKMXw7adAhfKTuCQHqhr",NativeTokenAddresses.associated(OWNER,SOL,NativeJupiterRoute.TOKEN));
        assertEquals("867tEAYiu9Q5JWAMEpqGAzgFARZ48udPQjhunrxESHMf",NativeTokenAddresses.associated(OWNER,USDC,NativeJupiterRoute.TOKEN));
        assertEquals("DjSRugn5Jm6qoD43SJesF6QqWHxf9zWbMbPQhijYSrqv",NativeTokenAddresses.associated(OWNER,SOL,NativeJupiterRoute.TOKEN_2022));
        assertEquals("43VMwsnLPpUc7oasWSmfFXyCCXHWHxdM65JMyKYrp6he",NativeTokenAddresses.associated(OWNER,USDC,NativeJupiterRoute.TOKEN_2022));
    }
    @Test public void invalidInputNeverFallsBackToAnotherProgram() {
        assertThrows(IllegalArgumentException.class,()->NativeTokenAddresses.associated(OWNER,SOL,"wrong"));
        assertThrows(IllegalArgumentException.class,()->NativeTokenAddresses.associated("wrong",SOL,NativeJupiterRoute.TOKEN));
    }
}
