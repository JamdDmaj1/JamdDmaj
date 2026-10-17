package com.jamddmaj.ai.wallet;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeSwapClockTest {
    @Test public void phoneCalendarOffsetCannotRejectAFreshQuoteOrExtendItsLife() throws Exception {
        long[] elapsed={500};
        NativeSwapClock clock=new NativeSwapClock(()->elapsed[0]);
        // Server generated the response at 100400ms; the HTTP Date is rounded
        // to 100000ms. This remains independent of any phone calendar setting.
        clock.anchor(100000,100,"0");
        assertEquals(101400,clock.wall());
        var envelope=NativeSwapPreparationTest.fixture();
        envelope.getJSONObject("preparation").put("receivedAt",100400).put("expiresAt",115400);
        var candidate=NativeSwapPreparation.parse(envelope,NativeSwapPreparationTest.intent(),clock.wall());
        assertEquals(115400,candidate.expiresAt);
        elapsed[0]=14499;
        NativeSwapPreparation.parse(envelope,NativeSwapPreparationTest.intent(),clock.wall());
        elapsed[0]=14500;
        assertThrows(NativeSwapPreparation.TimeMismatch.class,
            ()->NativeSwapPreparation.parse(envelope,NativeSwapPreparationTest.intent(),clock.wall()));
    }
    @Test public void uncertaintyAndNetworkDelayReduceRemainingLifetime() {
        long[] elapsed={10000};
        NativeSwapClock clock=new NativeSwapClock(()->elapsed[0]);
        clock.anchor(100000,0,null);
        assertEquals(111000,clock.wall());
        elapsed[0]=11000;
        assertEquals(112000,clock.wall());
        assertThrows(NativeSwapPreparation.TimeMismatch.class,()->clock.anchor(200000,10000,"0"));
        assertEquals(112000,clock.wall());
    }
    @Test public void missingDateCachedResponseSlowRequestAndInvalidTimersFailClosed() {
        long[] elapsed={1000};
        assertThrows(NativeSwapPreparation.TimeMismatch.class,()->new NativeSwapClock(()->elapsed[0]).wall());
        for(long date:new long[]{-1,0,Long.MAX_VALUE})
            assertThrows(NativeSwapPreparation.TimeMismatch.class,()->new NativeSwapClock(()->elapsed[0]).anchor(date,0,"0"));
        for(String age:new String[]{"1","-1","invalid",""})
            assertThrows(NativeSwapPreparation.TimeMismatch.class,()->new NativeSwapClock(()->elapsed[0]).anchor(100000,0,age));
        assertThrows(NativeSwapPreparation.TimeMismatch.class,()->new NativeSwapClock(()->elapsed[0]).anchor(100000,1001,"0"));
        assertThrows(NativeSwapPreparation.TimeMismatch.class,()->new NativeSwapClock(()->elapsed[0]).anchor(100000,-1,"0"));
        elapsed[0]=10001;
        assertThrows(NativeSwapPreparation.TimeMismatch.class,()->new NativeSwapClock(()->elapsed[0]).anchor(100000,0,"0"));
        NativeSwapClock anchored=new NativeSwapClock(()->elapsed[0]);anchored.anchor(100000,10000,"0");
        elapsed[0]=10000;
        assertThrows(NativeSwapPreparation.TimeMismatch.class,()->anchored.wall());
    }
    @Test public void responseStillCannotSmuggleAnAlreadyExpiredOrFutureQuote() throws Exception {
        NativeSwapClock clock=new NativeSwapClock(()->500L);clock.anchor(100000,100,"0");
        var envelope=NativeSwapPreparationTest.fixture();
        for(long received:new long[]{80000,102000}) {
            envelope.getJSONObject("preparation").put("receivedAt",received).put("expiresAt",received+15000);
            assertThrows(NativeSwapPreparation.TimeMismatch.class,
                ()->NativeSwapPreparation.parse(envelope,NativeSwapPreparationTest.intent(),clock.wall()));
        }
    }
}
