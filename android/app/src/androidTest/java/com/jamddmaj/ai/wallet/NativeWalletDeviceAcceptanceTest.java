package com.jamddmaj.ai.wallet;

import android.Manifest;
import android.app.Instrumentation;
import android.content.*;
import android.content.pm.*;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Only the separate, network-disabled audit app. No real profiles, vault
 * access, wallet transaction signing, network calls or production app writes. */
@RunWith(AndroidJUnit4.class)
public class NativeWalletDeviceAcceptanceTest {
    private static final String PACKAGE="com.jamddmaj.ai.walletaudit";
    private Instrumentation instrumentation;
    private Context context;
    @Before public void isolatedTargetOnly(){
        instrumentation=InstrumentationRegistry.getInstrumentation();context=instrumentation.getTargetContext();
        assertEquals("Refusing to test any existing wallet package",PACKAGE,context.getPackageName());
        assertEquals(PackageManager.PERMISSION_DENIED,context.checkSelfPermission(Manifest.permission.INTERNET));
    }
    @Test public void installedManifestKeepsNativeWalletPrivateAndNetworkingAbsent()throws Exception{
        PackageManager pm=context.getPackageManager();
        ActivityInfo activity=pm.getActivityInfo(new ComponentName(context,NativeWalletActivity.class),0);
        assertFalse(activity.exported);assertEquals(PACKAGE+":native_wallet",activity.processName);
        assertEquals(0,context.getApplicationInfo().flags&ApplicationInfo.FLAG_ALLOW_BACKUP);
        assertEquals(PackageManager.PERMISSION_DENIED,context.checkSelfPermission(Manifest.permission.RECORD_AUDIO));
        Intent callback=new Intent(Intent.ACTION_VIEW,android.net.Uri.parse("jamddmaj://phantom")).setPackage(PACKAGE);
        assertTrue(pm.queryIntentActivities(callback,0).isEmpty());
    }
    @Test public void packagedNativeSdkDerivesAndSignsOnlyNonTransactionFixtureBytes()throws Exception{
        byte[] entropy=new byte[32];Arrays.fill(entropy,(byte)43);
        byte[] message="JamdDmaj offline SDK self-test; not a Solana transaction".getBytes(StandardCharsets.UTF_8);
        try{
            NativeHdWallet.Addresses first=NativeHdWallet.addresses(entropy),second=NativeHdWallet.addresses(entropy);
            assertEquals(first.solana,second.solana);assertEquals(first.bnb,second.bnb);
            byte[] key=DevnetSolana.decode(first.solana,32),signature=NativeHdWallet.signSolana(entropy,message);
            assertTrue(Ed25519.verify(signature,0,key,0,message,0,message.length));
            assertEquals(NativeTokenAddresses.associated(first.solana,NativeSolanaTokens.USDC,SplTokenAccount.PROGRAM),
                DevnetSolana.encode(NativePerpsTokenBoundary.associated(key,NativeSolanaTokens.USDC)));
            Arrays.fill(signature,(byte)0);
        }finally{Arrays.fill(entropy,(byte)0);}
    }
    @Test public void realAndroidStorageKeepsUnknownAttemptAcrossNewJournalInstances()throws Exception{
        File ownTestRoot=Files.createTempDirectory(context.getNoBackupFilesDir().toPath(),"offline-journal-").toFile();
        Context fixture=new ContextWrapper(context){@Override public File getNoBackupFilesDir(){return ownTestRoot;}};
        byte[] seed=new byte[32];Arrays.fill(seed,(byte)17);String payer=DevnetSolana.address(seed);
        NativeWalletProfiles.Profile owner=new NativeWalletProfiles.Profile(UUID.randomUUID().toString().replace("-",""),UUID.randomUUID().toString().replace("-",""),"Disposable offline fixture",payer,"0x"+"1".repeat(40),1000);
        // This is an identifier for a fixture record, never a signed transaction.
        String id=DevnetSolana.encode(DevnetSolana.sign(seed,"offline journal identity".getBytes(StandardCharsets.UTF_8)));
        try{
            NativeTransferJournal journal=new NativeTransferJournal(fixture,owner,WalletNetwork.SOLANA_MAINNET);
            journal.begin(id,payer,BigInteger.ONE,BigInteger.valueOf(5000));
            NativeTransferJournal restarted=new NativeTransferJournal(fixture,owner,WalletNetwork.SOLANA_MAINNET);
            assertEquals(id,restarted.latest().transactionId);assertEquals(NativeTransferJournal.Phase.UNKNOWN,restarted.latest().phase);
            try{restarted.requireNoPending();fail("Unknown attempt must remain blocked");}catch(java.io.IOException expected){}
            restarted.settled(id,false);assertEquals(NativeTransferJournal.Phase.FAILED,new NativeTransferJournal(fixture,owner,WalletNetwork.SOLANA_MAINNET).latest().phase);
        }finally{Arrays.fill(seed,(byte)0);}
        // Leave the harmless fixture record for inspection. Never clear app data.
    }
    @Test public void lockedFuturesActionsStayReadOnlyOnDevice()throws Exception{
        assertTrue("Use a fresh audit install, never a recovered wallet",new NativeWalletProfiles(context).list().isEmpty());
        context.startActivity(new Intent(context,NativeWalletActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("wallet-navigation","perps"));
        waitForOwnWindow();
        for(String[] text:new String[][]{{"Review full close","Revisar cierre completo"},{"Review selected cancellation","Revisar cancelación seleccionada"},
                {"Review conversion to USDC","Revisar conversión a USDC"},{"Check close receipt and conversion","Consultar recibo del cierre y conversión"}})clickOnlyOwnButton(text);
        assertTrue(new NativeWalletProfiles(context).list().isEmpty());
    }
    private AccessibilityNodeInfo ownWindow(){
        AccessibilityNodeInfo root=instrumentation.getUiAutomation().getRootInActiveWindow();
        if(root==null||!PACKAGE.contentEquals(root.getPackageName()==null?"":root.getPackageName()))return null;
        return root;
    }
    private void waitForOwnWindow(){
        for(int i=0;i<30;i++){if(ownWindow()!=null)return;SystemClock.sleep(100);}fail("Audit app not foreground/unlocked; no other app will be inspected");
    }
    private void clickOnlyOwnButton(String[] labels){
        for(int attempt=0;attempt<18;attempt++){
            AccessibilityNodeInfo root=ownWindow();assertNotNull("Refusing to inspect another app",root);
            for(String text:labels){
            for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByText(text)){
                if(!text.contentEquals(node.getText()==null?"":node.getText())||!node.isClickable())continue;
                node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());SystemClock.sleep(80);
                if(node.performAction(AccessibilityNodeInfo.ACTION_CLICK)){SystemClock.sleep(120);assertNotNull(ownWindow());return;}
            }
            }
            if(!scroll(root))break;SystemClock.sleep(80);
        }fail("Missing or unreachable locked action: "+Arrays.toString(labels));
    }
    private boolean scroll(AccessibilityNodeInfo node){
        if(node.isScrollable()&&node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD))return true;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null&&scroll(child))return true;}return false;
    }
}
