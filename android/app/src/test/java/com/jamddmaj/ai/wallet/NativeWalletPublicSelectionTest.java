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
  assertEquals(5,data.length());assertFalse(data.has("vaultId"));assertFalse(data.has("ownerId"));
 }
 @Test public void unknownProfileCannotBecomeSelected()throws Exception{
  try{new NativeWalletPublicSelection(context()).select(profile(1));fail("Unknown account selected");}catch(java.io.IOException|IllegalArgumentException expected){}
 }
}
