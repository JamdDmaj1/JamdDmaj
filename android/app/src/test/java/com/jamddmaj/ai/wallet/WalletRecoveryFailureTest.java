package com.jamddmaj.ai.wallet;
import org.junit.Test;
import static org.junit.Assert.*;
public class WalletRecoveryFailureTest {
    @Test public void authenticationDoesNotClaimPasswordOrBiometricsAreDefinitelyWrong(){
        assertEquals("BACKUP_AUTH",WalletRecoveryFailure.code(new Exception(new javax.crypto.AEADBadTagException("not displayed"))));
    }
    @Test public void storageAndUnknownFailuresAreDistinct(){
        assertEquals("BACKUP_STORAGE",WalletRecoveryFailure.code(new java.io.IOException("not displayed")));
        assertEquals("RECOVERY_UNCONFIRMED",WalletRecoveryFailure.code(new IllegalArgumentException("not displayed")));
    }
}
