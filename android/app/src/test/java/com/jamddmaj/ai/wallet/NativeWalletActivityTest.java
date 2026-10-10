package com.jamddmaj.ai.wallet;

import android.content.ComponentName;
import android.content.pm.ActivityInfo;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.MotionEvent;
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
    @Test public void appHeaderReturnsToAssetsAndClearsSensitiveInputsWithoutOpeningAnotherActivity(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            assertNotNull(activity.getWindow().getDecorView().findViewWithTag("native-wallet-shell"));
            inputs.get(1).setText("temporary password");
            View back=activity.getWindow().getDecorView().findViewWithTag("wallet-back-to-assets");
            assertNotNull(back);back.performClick();assertTrue(activity.isFinishing());
            assertEquals("",inputs.get(1).getText().toString());
            assertNull(org.robolectric.Shadows.shadowOf(activity).getNextStartedActivity());
        }
    }
    @Test public void recoveryOpensBackupFormAndClearsOldPasswords(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            assertEquals(View.GONE,((View)inputs.get(0).getParent()).getVisibility());
            inputs.get(1).setText("old password");inputs.get(2).setText("old password");
            activity.showRecoveryForm();
            assertEquals(View.VISIBLE,((View)inputs.get(0).getParent()).getVisibility());
            assertEquals(View.GONE,((View)inputs.get(3).getParent()).getVisibility());
            assertEquals(View.GONE,((View)inputs.get(5).getParent()).getVisibility());
            assertEquals("",inputs.get(1).getText().toString());assertEquals("",inputs.get(2).getText().toString());
        }
    }
    @Test public void obscuredTouchesCannotConfirmWalletActions(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            MotionEvent.PointerProperties pointer=new MotionEvent.PointerProperties();pointer.id=0;pointer.toolType=MotionEvent.TOOL_TYPE_FINGER;
            MotionEvent.PointerCoords coords=new MotionEvent.PointerCoords();coords.x=50;coords.y=50;coords.pressure=1;coords.size=1;
            for(int flags:new int[]{MotionEvent.FLAG_WINDOW_IS_OBSCURED,MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED}){
                MotionEvent event=MotionEvent.obtain(1,1,MotionEvent.ACTION_DOWN,1,new MotionEvent.PointerProperties[]{pointer},new MotionEvent.PointerCoords[]{coords},0,0,1,1,0,0,0,flags);
                try{assertFalse(controller.get().dispatchTouchEvent(event));assertFalse(new WalletReviewDialog(controller.get()).dispatchTouchEvent(event));}finally{event.recycle();}
            }
        }
    }
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
            assertEquals(12,inputs.size());
            for(EditText field:inputs){assertFalse(field.isSaveEnabled());assertEquals(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS,field.getImportantForAutofill());}
            inputs.get(1).setText("public test password");inputs.get(2).setText("public test password");
            controller.stop();
            assertEquals("",inputs.get(1).getText().toString());assertEquals("",inputs.get(2).getText().toString());
        }
    }
    @Test public void swapFormUsesMintAddressesAndCannotPrepareWhileLocked(){
        try(var controller=Robolectric.buildActivity(NativeWalletActivity.class).create()){
            var activity=controller.get();ArrayList<EditText> inputs=new ArrayList<>();fields(activity.getWindow().getDecorView(),inputs);
            assertEquals(NativeSwapSetup.SOL,inputs.get(7).getText().toString());
            assertEquals(NativeSolanaTokens.USDC,inputs.get(8).getText().toString());
            assertEquals("",inputs.get(9).getText().toString());
            assertEquals(View.GONE,((View)inputs.get(7).getParent()).getVisibility());
            activity.reviewSwap();
            activity.reviewUsdc();
            assertNull(org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog());
        }
    }
}
