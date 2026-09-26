package com.jamddmaj.ai.wallet;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.math.BigInteger;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class BnbSignerTest {
    @Test public void signsDeterministicallyButRejectsWrongOwner()throws Exception{
        byte[] entropy=new byte[32];String owner=NativeHdWallet.addresses(entropy).bnb;
        String recipient="0x3535353535353535353535353535353535353535";
        byte[] a=NativeBnbSigner.sign(entropy,owner,recipient,BigInteger.ONE,BigInteger.ZERO,BigInteger.valueOf(1000000000),BigInteger.valueOf(21000));
        byte[] b=NativeBnbSigner.sign(entropy,owner,recipient,BigInteger.ONE,BigInteger.ZERO,BigInteger.valueOf(1000000000),BigInteger.valueOf(21000));
        assertArrayEquals(a,b);assertTrue(a.length>90&&a.length<200);
        try{NativeBnbSigner.sign(entropy,recipient,owner,BigInteger.ONE,BigInteger.ZERO,BigInteger.ONE,BigInteger.valueOf(21000));fail("Wrong owner accepted");}catch(SecurityException expected){}
        assertArrayEquals(new byte[32],entropy);
    }
}
