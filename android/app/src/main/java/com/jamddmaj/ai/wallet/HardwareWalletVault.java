package com.jamddmaj.ai.wallet;

import android.content.Context;

/** Production BIP39 entropy storage. Owner IDs must come from native authorized profile selection, never WebView input. */
public final class HardwareWalletVault extends HardwareSecretVault {
    public HardwareWalletVault(Context context, String nativeOwnerId, String walletId) throws Exception {
        super(context, WalletVaultDomain.production(context.getPackageName(), nativeOwnerId, walletId));
    }
}
