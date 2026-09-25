package com.jamddmaj.ai.wallet;

import android.content.Context;

/** Existing devnet domain. Its aliases, AAD and file format must remain compatible. */
public final class HardwareTestVault extends HardwareSecretVault {
    public HardwareTestVault(Context context, String testWalletId) throws Exception {
        super(context, WalletVaultDomain.devnet(context.getPackageName(), testWalletId));
    }
}
