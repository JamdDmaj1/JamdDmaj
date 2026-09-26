package com.jamddmaj.ai.wallet;

import android.content.ComponentName;
import android.content.pm.ActivityInfo;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.EditText;
import java.util.ArrayList;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeWalletActivityTest {
    private void fields(View view,ArrayList<EditText> result){
        if(view instanceof EditText)result.add((EditText)view);
        if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)fields(group.getChildAt(i),result);}
    }
    @Test public void nativeScreenIsPrivateAndSeparateFromWebProcess() throws Exception {
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();
            assertNotEquals(0,activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE);
            ActivityInfo info=activity.getPackageManager().getActivityInfo(new ComponentName(activity,NativeWalletActivity.class),0);
            assertFalse(info.exported);
            assertTrue(info.processName.endsWith(":native_wallet"));
        }
    }
    @Test public void backgroundClearsPasswordsAndDisablesSavedFieldState(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create().start()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            assertEquals(5,inputs.size());
            for(EditText field:inputs){assertFalse(field.isSaveEnabled());assertEquals(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS,field.getImportantForAutofill());}
            inputs.get(1).setText("public test password");inputs.get(2).setText("public test password");
            controller.stop();
            assertEquals("",inputs.get(1).getText().toString());assertEquals("",inputs.get(2).getText().toString());
        }
    }
}
