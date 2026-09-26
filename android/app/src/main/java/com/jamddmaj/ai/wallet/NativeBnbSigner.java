package com.jamddmaj.ai.wallet;

import com.google.protobuf.ByteString;
import java.math.BigInteger;
import java.util.Arrays;
import wallet.core.java.AnySigner;
import wallet.core.jni.CoinType;
import wallet.core.jni.proto.Ethereum;

/** Native only, fixed BSC chain 56. No network transport or generic JavaScript signer. */
public final class NativeBnbSigner {
    private static ByteString uint(BigInteger value){
        if(value==null||value.signum()<0||value.bitLength()>256)throw new IllegalArgumentException("Invalid EVM integer");
        if(value.signum()==0)return ByteString.EMPTY;
        byte[] bytes=value.toByteArray();return ByteString.copyFrom(bytes,bytes[0]==0?1:0,bytes.length-(bytes[0]==0?1:0));
    }
    static byte[] sign(byte[] entropy,String expectedOwner,String recipient,BigInteger amount,BigInteger nonce,BigInteger gasPrice,BigInteger gasLimit)throws Exception{
        if(expectedOwner==null||recipient==null||!recipient.matches("0x[0-9a-fA-F]{40}")||recipient.matches("0x0{40}")||recipient.equalsIgnoreCase(expectedOwner))
            throw new IllegalArgumentException("Invalid recipient");
        if(amount==null||amount.signum()<=0||gasPrice==null||gasPrice.signum()<=0||gasLimit==null||gasLimit.compareTo(BigInteger.valueOf(21000))<0||gasLimit.compareTo(BigInteger.valueOf(500000))>0)
            throw new IllegalArgumentException("Invalid reviewed amounts");
        var key=NativeHdWallet.open(entropy).getKey(CoinType.ETHEREUM,WalletRecoveryProfile.EVM_PATH);
        if(!CoinType.ETHEREUM.deriveAddress(key).equalsIgnoreCase(expectedOwner))throw new SecurityException("Unlocked wallet differs from review");
        byte[] raw=key.data();
        try{
            var input=Ethereum.SigningInput.newBuilder().setChainId(uint(BigInteger.valueOf(56))).setNonce(uint(nonce))
                .setGasPrice(uint(gasPrice)).setGasLimit(uint(gasLimit)).setToAddress(recipient)
                .setPrivateKey(ByteString.copyFrom(raw)).setTransaction(Ethereum.Transaction.newBuilder()
                    .setTransfer(Ethereum.Transaction.Transfer.newBuilder().setAmount(uint(amount)))).build();
            var output=AnySigner.sign(input,CoinType.ETHEREUM,Ethereum.SigningOutput.parser());
            if(output.getErrorValue()!=0||output.getEncoded().isEmpty())throw new IllegalStateException("Native BNB signing failed");
            return output.getEncoded().toByteArray();
        }finally{Arrays.fill(raw,(byte)0);}
        // Protobuf/JNI create managed copies; wiping raw cannot erase all copies.
        // This signer must run only in the dedicated native wallet process.
    }
    private NativeBnbSigner(){}
}
