package com.jamddmaj.ai.wallet;

import java.io.File;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.StandardOpenOption;

/** Persist rename/new-directory metadata after AtomicFile's file-content sync. Fail closed. */
final class WalletStorageBarrier {
    static void syncParents(File file,File privateRoot)throws IOException{
        File root=privateRoot.getCanonicalFile(),directory=file.getCanonicalFile().getParentFile();
        if(directory==null||!directory.toPath().startsWith(root.toPath()))throw new IOException("Wallet storage outside private root");
        while(true){
            try(FileChannel channel=FileChannel.open(directory.toPath(),StandardOpenOption.READ)){channel.force(true);}
            if(directory.equals(root))return;
            directory=directory.getParentFile();if(directory==null)throw new IOException("Invalid wallet storage hierarchy");
        }
    }
    private WalletStorageBarrier(){}
}
