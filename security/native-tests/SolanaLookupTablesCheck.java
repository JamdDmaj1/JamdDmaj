import com.jamddmaj.ai.wallet.SolanaMessage;
import com.jamddmaj.ai.wallet.SolanaLookupTables;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.List;

public final class SolanaLookupTablesCheck {
    static final BigInteger SLOT = BigInteger.valueOf(100);
    static byte[] data() {
        byte[] bytes = new byte[56+9*32]; bytes[0] = 1;
        Arrays.fill(bytes,4,12,(byte)255); bytes[12] = 99;
        for (int i = 0; i < 9; i++) bytes[56+i*32] = (byte)(10+i);
        return bytes;
    }
    static void reject(Runnable action) {
        try { action.run(); throw new AssertionError("Accepted unsafe lookup"); } catch (IllegalArgumentException expected) {}
    }
    static SolanaLookupTables.Resolved resolve(byte[] data, BigInteger slot) {
        SolanaMessage m = SolanaMessage.parse(SolanaMessageCheck.fixture(true));
        return SolanaLookupTables.resolve(m,List.of(new SolanaLookupTables.Account(m.lookups.get(0).key(),SolanaLookupTables.PROGRAM,false,data,slot)),SLOT);
    }
    public static void main(String[] args) {
        byte[] original = data();
        SolanaLookupTables.Resolved resolved = resolve(original,SLOT);
        SolanaMessageCheck.require(resolved.size() == 4 && resolved.key(2)[0] == 17 && resolved.key(3)[0] == 18);
        original[56+7*32] = 0; byte[] copied = resolved.key(2); copied[0] = 0;
        SolanaMessageCheck.require(resolved.key(2)[0] == 17);
        reject(() -> resolve(data(),BigInteger.valueOf(99)));
        byte[] inactive = data(); inactive[4] = 0; reject(() -> resolve(inactive,SLOT));
        byte[] sameSlot = data(); sameSlot[12] = 100; sameSlot[20] = 8; reject(() -> resolve(sameSlot,SLOT));
        sameSlot[20] = 9; resolve(sameSlot,SLOT);
        byte[] future = data(); future[12] = 101; reject(() -> resolve(future,SLOT));
        byte[] badState = data(); badState[0] = 0; reject(() -> resolve(badState,SLOT));
        byte[] alias = data(); alias[56+7*32] = 1; reject(() -> resolve(alias,SLOT));
        byte[] repeated = data(); repeated[56+8*32] = 17; reject(() -> resolve(repeated,SLOT));
        reject(() -> new SolanaLookupTables.Account(new byte[32],"other",false,data(),SLOT));
        reject(() -> new SolanaLookupTables.Account(new byte[32],SolanaLookupTables.PROGRAM,true,data(),SLOT));
        reject(() -> new SolanaLookupTables.Account(new byte[32],SolanaLookupTables.PROGRAM,false,new byte[57],SLOT));
        System.out.println("Lookup ownership, activation, snapshot, alias and copy checks passed");
    }
}
