package com.jamddmaj.ai.wallet;

import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/** Native devnet-only backup format; not compatible with production wallet seed phrases. */
public final class PortableTestBackup {
    private static final byte[] HEADER={'J','A','M','D','D','E','V',1};
    public static final int SIZE=84;
    private static SecretKeySpec key(char[] password,byte[] salt)throws Exception{
        if(password==null||password.length<16||password.length>1024)throw new IllegalArgumentException("Use 16+ characters");
        PBEKeySpec spec=new PBEKeySpec(password,salt,600000,256);byte[] raw=null;
        try{raw=SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();return new SecretKeySpec(raw,"AES");}
        finally{spec.clearPassword();if(raw!=null)Arrays.fill(raw,(byte)0);}
    }
    public static byte[] seal(byte[] seed,char[] password)throws Exception{
        if(seed==null||seed.length!=32)throw new IllegalArgumentException("Invalid test seed");
        byte[] salt=new byte[16],iv=new byte[12];SecureRandom random=new SecureRandom();random.nextBytes(salt);random.nextBytes(iv);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(password,salt),new GCMParameterSpec(128,iv));cipher.updateAAD(HEADER);
        byte[] result=new byte[SIZE];System.arraycopy(HEADER,0,result,0,8);System.arraycopy(salt,0,result,8,16);System.arraycopy(iv,0,result,24,12);System.arraycopy(cipher.doFinal(seed),0,result,36,48);return result;
    }
    public static byte[] open(byte[] backup,char[] password)throws Exception{
        if(backup==null||backup.length!=SIZE||!Arrays.equals(HEADER,Arrays.copyOf(backup,8)))throw new IllegalArgumentException("Invalid devnet backup");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(password,Arrays.copyOfRange(backup,8,24)),new GCMParameterSpec(128,Arrays.copyOfRange(backup,24,36)));cipher.updateAAD(HEADER);
        return cipher.doFinal(backup,36,48);
    }
    private PortableTestBackup(){}
}
