package com.renewly.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class QuickAddNavigationTest {

    private static final int INTENT_FLAGS =
        Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP;

    @Test
    public void intentTargetsMainActivityWithQuickAddExtra() {
        Context context = RuntimeEnvironment.getApplication();
        Intent intent = QuickAddNavigation.intent(context);

        assertNotNull(intent.getComponent());
        assertEquals(MainActivity.class.getName(), intent.getComponent().getClassName());
        assertTrue(intent.getBooleanExtra(QuickAddNavigation.EXTRA_QUICK_ADD, false));
        assertEquals(INTENT_FLAGS, intent.getFlags() & INTENT_FLAGS);
    }

    @Test
    public void pendingIntentKeepsQuickAddIntent() {
        Context context = RuntimeEnvironment.getApplication();
        PendingIntent pendingIntent = QuickAddWidget.quickAddPendingIntent(context);

        assertNotNull(pendingIntent);
        Intent saved = shadowOf(pendingIntent).getSavedIntent();
        assertNotNull(saved);
        assertTrue(saved.getBooleanExtra(QuickAddNavigation.EXTRA_QUICK_ADD, false));
        assertEquals(MainActivity.class.getName(), saved.getComponent().getClassName());
    }

    @Test
    public void expensesUrlNormalizesTheWebViewBase() {
        assertEquals(
            "https://localhost/#/expenses?new=1",
            QuickAddNavigation.expensesUrl("https://localhost")
        );
        assertEquals(
            "https://localhost/#/expenses?new=1",
            QuickAddNavigation.expensesUrl("https://localhost/")
        );
        assertEquals(
            "https://localhost/#/expenses?new=1",
            QuickAddNavigation.expensesUrl(null)
        );
        assertEquals(
            "https://localhost/#/expenses?new=1",
            QuickAddNavigation.expensesUrl("")
        );
        assertEquals(
            "https://localhost/app/#/expenses?new=1",
            QuickAddNavigation.expensesUrl("https://localhost/app/")
        );
    }

    @Test
    public void widgetLayoutUsesTheQuickAddView() {
        Context context = RuntimeEnvironment.getApplication();
        RemoteViews views = new RemoteViews(
            context.getPackageName(),
            R.layout.widget_quick_add
        );
        assertNotNull(views);
    }
}
