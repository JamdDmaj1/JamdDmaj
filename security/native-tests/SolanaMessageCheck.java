import com.jamddmaj.ai.wallet.SolanaMessage;
import java.io.ByteArrayOutputStream;
import java.util.Arrays;

public final class SolanaMessageCheck {
    static void require(boolean ok) { if (!ok) throw new AssertionError(); }
    static void reject(byte[] bytes) {
        try { SolanaMessage.parse(bytes); throw new AssertionError("Accepted invalid message"); }
        catch (IllegalArgumentException expected) {}
    }
    static byte[] fixture(boolean versioned) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        if (versioned) b.write(128);
        b.writeBytes(new byte[]{1,0,1,2});
        byte[] key = new byte[32]; key[0] = 1; b.writeBytes(key);
        key[0] = 2; b.writeBytes(key); key[0] = 3; b.writeBytes(key);
        b.writeBytes(new byte[]{1,1,1,(byte)(versioned ? 2 : 0),1,9});
        if (versioned) { b.write(1); key[0] = 4; b.writeBytes(key); b.writeBytes(new byte[]{1,7,1,8}); }
        return b.toByteArray();
    }
    public static void main(String[] args) {
        for (boolean versioned : new boolean[]{false,true}) {
            byte[] bytes = fixture(versioned);
            SolanaMessage message = SolanaMessage.parse(bytes);
            require(message.version == (versioned ? 0 : -1));
            require(message.signatures == 1 && message.staticAccountCount() == 2);
            require(message.isSigner(0) && message.isWritable(0) && !message.isWritable(1));
            if (versioned) require(message.accountCount == 4 && message.isWritable(2) && !message.isWritable(3) && !message.isSigner(2));
            for (int i = 0; i < bytes.length; i++) reject(Arrays.copyOf(bytes,i));
            reject(Arrays.copyOf(bytes,bytes.length + 1));
            byte[] before = message.bytes(); bytes[4] ^= 1;
            byte[] key = message.staticKey(0); key[0] ^= 1;
            byte[] data = message.instructions.get(0).data(); data[0] ^= 1;
            require(Arrays.equals(before,message.bytes()));
        }
        byte[] bad = fixture(true); bad[0] = (byte)129; reject(bad);
        bad = fixture(false); bad[0] = 0; reject(bad);
        bad = fixture(false); bad[1] = 1; reject(bad);
        bad = fixture(false); bad[2] = 2; reject(bad);
        bad = fixture(false); System.arraycopy(bad,4,bad,36,32); reject(bad);
        bad = fixture(false); bad[101] = 0; reject(bad);
        bad = fixture(false); bad[103] = 2; reject(bad);
        bad = fixture(true); bad[bad.length-1] = 7; reject(bad);
        byte[] original = fixture(false);
        bad = new byte[original.length+1]; System.arraycopy(original,0,bad,0,3);
        bad[3] = (byte)130; bad[4] = 0; System.arraycopy(original,4,bad,5,original.length-4); reject(bad);
        reject(new byte[1168]);
        System.out.println("Solana message bounds, privileges, versioning and immutability verified");
    }
}
