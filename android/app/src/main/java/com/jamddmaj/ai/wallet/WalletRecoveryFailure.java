package com.jamddmaj.ai.wallet;

/** Safe diagnostic codes only. Never surface exception messages or secret values. */
final class WalletRecoveryFailure {
    static String code(Throwable error) {
        for(int i=0;error!=null&&i<8;i++,error=error.getCause()) {
            if(error instanceof javax.crypto.AEADBadTagException)return "BACKUP_AUTH";
            if(error instanceof android.security.keystore.KeyPermanentlyInvalidatedException)return "KEY_INVALIDATED";
            if(error instanceof java.io.IOException)return "BACKUP_STORAGE";
        }
        return "RECOVERY_UNCONFIRMED";
    }
}
