package com.jamddmaj.ai;

import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device-local account access only. Does not store or access wallet keys. */
@CapacitorPlugin(name = "AccountSession")
public final class AccountSessionPlugin extends Plugin {
    private static final String ALIAS = "jamddmaj.account.session.v1";
    private static final String PREFS = "jamddmaj_account_session";
    private boolean trusted() {
        Uri page = Uri.parse(getBridge().getWebView().getUrl() == null ? "" : getBridge().getWebView().getUrl());
        return "https".equals(page.getScheme()) && "localhost".equals(page.getHost())
            && page.getPort() == -1 && page.getUserInfo() == null
            && ("/".equals(page.getPath()) || "/index.html".equals(page.getPath()));
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    @PluginMethod public synchronized void save(PluginCall call) {
        if (!trusted()) { call.reject("session-origin-rejected"); return; }
        String token = call.getString("token", "");
        if (!token.matches("^[a-f0-9]{64}$")) { call.reject("session-format-rejected"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
            String encrypted = Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            boolean saved = getContext().getSharedPreferences(PREFS, 0).edit()
                .putString("ciphertext", encrypted).putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putLong("expires", System.currentTimeMillis() + 7L * 24 * 60 * 60 * 1000).commit();
            if (!saved) throw new Exception();
            call.resolve();
        } catch (Exception unavailable) { call.reject("session-save-unavailable"); }
    }
    @PluginMethod public synchronized void restore(PluginCall call) {
        if (!trusted()) { call.reject("session-origin-rejected"); return; }
        try {
            android.content.SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
            String encrypted = prefs.getString("ciphertext", ""), iv = prefs.getString("iv", "");
            JSObject result = new JSObject();
            if (encrypted.isEmpty() || prefs.getLong("expires", 0) <= System.currentTimeMillis()) {
                result.put("token", ""); call.resolve(result); return;
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
            String token = new String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8);
            if (!token.matches("^[a-f0-9]{64}$")) throw new Exception();
            result.put("token", token); call.resolve(result);
        } catch (Exception unavailable) { call.reject("session-restore-unavailable"); }
    }
    @PluginMethod public synchronized void clear(PluginCall call) {
        if (!trusted()) { call.reject("session-origin-rejected"); return; }
        if (getContext().getSharedPreferences(PREFS, 0).edit().clear().commit()) call.resolve();
        else call.reject("session-clear-unavailable");
    }
}
