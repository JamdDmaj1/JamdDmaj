package com.jamddmaj.ai.wallet;
import android.content.Context;
import android.content.ContextWrapper;
import java.io.File;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=30)
public class NativeWalletPublicSelectionTest {
 @Rule public TemporaryFolder folder=new TemporaryFolder();
 private Context context(){return new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};}
 private NativeWalletProfiles.Profile profile(int id){byte[] pub=new byte[32];pub[31]=(byte)id;return new NativeWalletProfiles.Profile(String.format("%032x",id),String.format("%032x",id+10),"Wallet "+id,DevnetSolana.encode(pub),String.format("0x%040x",id),1000);}
 @Test public void publicSelectionSurvivesNewInstanceWithoutVaultAccess()throws Exception{
  Context context=context();NativeWalletProfiles registry=new NativeWalletProfiles(context);var one=profile(1);registry.saveRecovered(one);
  assertEquals(one.solanaAddress,new NativeWalletPublicSelection(context).publicAccount().getString("address"));
  registry.saveRecovered(profile(2));assertFalse(new NativeWalletPublicSelection(context).publicAccount().getBoolean("available"));
  new NativeWalletPublicSelection(context).select(one);
  var data=new NativeWalletPublicSelection(context).publicAccount();assertTrue(data.getBoolean("available"));assertEquals(one.solanaAddress,data.getString("address"));
  assertEquals(7,data.length());assertFalse(data.has("vaultId"));assertFalse(data.has("ownerId"));
  assertTrue(data.getBoolean("pendingKnown"));assertEquals(0,data.getJSONArray("pending").length());
 }
 @Test public void unknownProfileCannotBecomeSelected()throws Exception{
  try{new NativeWalletPublicSelection(context()).select(profile(1));fail("Unknown account selected");}catch(java.io.IOException|IllegalArgumentException expected){}
 }
 @Test public void pendingPublicDisplayNeverExportsJournalPayloadOrLosesAnUnknownHold()throws Exception{
  Context context=context();var one=profile(1);new NativeWalletProfiles(context).saveRecovered(one);
  byte[] signature=new byte[64];signature[0]=1;
  NativeTransferJournal journal=new NativeTransferJournal(context,one,WalletNetwork.SOLANA_MAINNET);
  journal.begin(DevnetSolana.encode(signature),one.solanaAddress,java.math.BigInteger.ONE,java.math.BigInteger.valueOf(5000));
  var data=new NativeWalletPublicSelection(context).publicAccount();
  assertTrue(data.getBoolean("pendingKnown"));var pending=data.getJSONArray("pending");assertEquals(1,pending.length());
  assertEquals("UNKNOWN",pending.getJSONObject(0).getString("state"));assertEquals(2,pending.getJSONObject(0).length());
  assertFalse(data.toString().contains("maximumFee"));assertFalse(data.toString().contains("recipient"));assertFalse(data.toString().contains("signedWire"));
 }
}
