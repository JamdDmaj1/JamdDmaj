package com.jamddmaj.ai.wallet;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/** Batched public test vectors over stdin; never accepts secret/signing inputs. */
public final class SolanaProgramAddressCheck {
    public static void main(String[] args)throws Exception{
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8))){
            String line;int count=0;
            while((line=reader.readLine())!=null){
                if(++count>10000||line.length()>2000)throw new IllegalArgumentException("Oversized vector input");
                String[] fields=line.split(" ",-1);
                if(fields[0].equals("curve")&&fields.length==2){System.out.println(SolanaProgramAddress.isCurvePoint(Base64.getDecoder().decode(fields[1])));continue;}
                if(!fields[0].equals("derive")||fields.length<2)throw new IllegalArgumentException("Invalid public vector");
                List<byte[]> seeds=new ArrayList<>();for(int i=2;i<fields.length;i++)seeds.add(Base64.getDecoder().decode(fields[i]));
                SolanaProgramAddress.Derived result=SolanaProgramAddress.find(fields[1],seeds);
                System.out.println(result.address()+":"+result.bump);
            }
        }
    }
}
