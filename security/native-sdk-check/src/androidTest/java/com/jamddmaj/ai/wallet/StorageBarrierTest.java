package com.jamddmaj.ai.wallet;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class StorageBarrierTest {
    @Test public void androidFilesystemSupportsPrivateDirectoryDurabilityBarrier()throws Exception{
        File root=InstrumentationRegistry.getInstrumentation().getTargetContext().getNoBackupFilesDir();
        File nested=new File(root,"barrier-check/"+java.util.UUID.randomUUID());assertTrue(nested.mkdirs());
        File value=new File(nested,"public-fixture");
        try(FileOutputStream output=new FileOutputStream(value)){output.write(1);output.getFD().sync();}
        WalletStorageBarrier.syncParents(value,root);
        assertTrue(value.isFile());
    }
    @Test public void rejectsStorageOutsidePrivateRoot()throws Exception{
        File root=InstrumentationRegistry.getInstrumentation().getTargetContext().getNoBackupFilesDir();
        try{WalletStorageBarrier.syncParents(new File(root.getParentFile(),"outside"),root);fail("Outside path accepted");}
        catch(java.io.IOException expected){}
    }
}
