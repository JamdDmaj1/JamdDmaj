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
 // These are read-only projection tests. Seed already-persisted, unfunded
 // metadata directly: production directory-fsync is tested separately and
 // cannot run on the Windows host filesystem used by Robolectric.
 private void storedText(File file,String text)throws Exception{java.nio.file.Files.write(file.toPath(),text.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
 private void storedProfiles(NativeWalletProfiles.Profile... profiles)throws Exception{
  org.json.JSONArray entries=new org.json.JSONArray();for(var profile:profiles)entries.put(profile.json());
  storedText(new File(folder.getRoot(),"native-wallet-profiles-v1.json"),new org.json.JSONObject().put("version",1).put("profiles",entries).toString());
 }
 private File storedJournal(NativeWalletProfiles.Profile owner,String phase)throws Exception{
  byte[] signature=new byte[64];signature[0]=1;
  File file=new File(folder.getRoot(),"wallet-transfers-v1/"+owner.ownerId+"/solana-mainnet.json");java.nio.file.Files.createDirectories(file.getParentFile().toPath());
  var record=new org.json.JSONObject().put("version",1).put("ownerId",owner.ownerId).put("network","solana-mainnet").put("from",owner.solanaAddress)
   .put("transactionId",DevnetSolana.encode(signature)).put("recipient",owner.solanaAddress).put("units","1").put("maximumFee","5000").put("phase",phase).put("createdAt",1000);
  storedText(file,record.toString());return file;
 }
 @Test public void publicSelectionSurvivesNewInstanceWithoutVaultAccess()throws Exception{
  Context context=context();var one=profile(1);storedProfiles(one);
  assertEquals(one.solanaAddress,new NativeWalletPublicSelection(context).publicAccount().getString("address"));
  storedProfiles(one,profile(2));assertFalse(new NativeWalletPublicSelection(context).publicAccount().getBoolean("available"));
  new NativeWalletPublicSelection(context).select(one);
  var data=new NativeWalletPublicSelection(context).publicAccount();assertTrue(data.getBoolean("available"));assertEquals(one.solanaAddress,data.getString("address"));
  assertEquals(7,data.length());assertFalse(data.has("vaultId"));assertFalse(data.has("ownerId"));
  assertTrue(data.getBoolean("pendingKnown"));assertEquals(0,data.getJSONArray("pending").length());
 }
 @Test public void unknownProfileCannotBecomeSelected()throws Exception{
  try{new NativeWalletPublicSelection(context()).select(profile(1));fail("Unknown account selected");}catch(java.io.IOException|IllegalArgumentException expected){}
 }
 @Test public void pendingPublicDisplayNeverExportsJournalPayloadOrLosesAnUnknownHold()throws Exception{
  Context context=context();var one=profile(1);storedProfiles(one);storedJournal(one,"UNKNOWN");
  var data=new NativeWalletPublicSelection(context).publicAccount();
  assertTrue(data.getBoolean("pendingKnown"));var pending=data.getJSONArray("pending");assertEquals(1,pending.length());
  assertEquals("UNKNOWN",pending.getJSONObject(0).getString("state"));assertEquals(2,pending.getJSONObject(0).length());
  assertFalse(data.toString().contains("maximumFee"));assertFalse(data.toString().contains("recipient"));assertFalse(data.toString().contains("signedWire"));
 }
 @Test public void malformedPendingStorageNeverBecomesAnEmptyKnownReservation()throws Exception{
  var one=profile(1);storedProfiles(one);File file=storedJournal(one,"UNKNOWN");storedText(file,"corrupt");
  var data=new NativeWalletPublicSelection(context()).publicAccount();assertTrue(data.getBoolean("available"));assertFalse(data.getBoolean("pendingKnown"));assertEquals(0,data.getJSONArray("pending").length());
 }
 @Test public void onlyTerminalJournalStatesHaveNoLocalPendingHold()throws Exception{
  var one=profile(1);storedProfiles(one);
  for(String phase:new String[]{"UNKNOWN","SUBMITTED","CONFIRMED","FAILED"}){
   storedJournal(one,phase);var data=new NativeWalletPublicSelection(context()).publicAccount();assertTrue(data.getBoolean("pendingKnown"));
   assertEquals(phase.equals("UNKNOWN")||phase.equals("SUBMITTED")?1:0,data.getJSONArray("pending").length());
  }
 }
 @Test public void anotherWalletJournalCannotSupplyThisAccountsPendingState()throws Exception{
  var one=profile(1);storedProfiles(one);File file=storedJournal(one,"UNKNOWN");
  var record=new org.json.JSONObject(new String(java.nio.file.Files.readAllBytes(file.toPath()),java.nio.charset.StandardCharsets.UTF_8));record.put("ownerId",profile(2).ownerId);storedText(file,record.toString());
  var data=new NativeWalletPublicSelection(context()).publicAccount();assertFalse(data.getBoolean("pendingKnown"));
 }
}
