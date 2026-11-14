package com.renewly.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAppWidgetManager;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class AndroidShellTest {

    private static String readAsset(Context context, String path) throws Exception {
        AssetManager assets = context.getAssets();
        try (InputStream input = assets.open(path);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    @Test
    @Config(sdk = 28)
    public void activityLaunchesTheCapacitorWebViewShell() {
        android.content.pm.PackageInfo webViewInfo = new android.content.pm.PackageInfo();
        webViewInfo.packageName = "com.google.android.webview";
        webViewInfo.versionName = "120.0.6099.144";
        org.robolectric.shadows.ShadowWebView.setCurrentWebViewPackage(webViewInfo);

        MainActivity activity = Robolectric.buildActivity(MainActivity.class).setup().get();
        assertNotNull(activity);
        assertNotNull(activity.getBridge());
        WebView webView = activity.getBridge().getWebView();
        assertNotNull(webView);
        assertTrue(webView.getSettings().getJavaScriptEnabled());
    }

    @Test
    public void packagedShellContainsTheCurrentWebBuild() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        String index = readAsset(context, "public/index.html");
        String styles = readAsset(context, "public/styles.css");
        String fonts = readAsset(context, "public/fonts/fonts.css");

        assertTrue(index.contains("beta-2.2"));
        assertTrue(index.contains("./fonts/fonts.css"));
        assertTrue(styles.contains("--font-ui"));
        assertTrue(fonts.contains("'Poppins'"));
        assertTrue(fonts.contains("'Manrope'"));
    }

    @Test
    public void quickAddWidgetBuildsAQuickAddIntent() {
        Context context = RuntimeEnvironment.getApplication();
        Intent intent = QuickAddNavigation.intent(context);
        assertEquals(MainActivity.class.getName(), intent.getComponent().getClassName());
        assertTrue(intent.getBooleanExtra(QuickAddNavigation.EXTRA_QUICK_ADD, false));
        assertTrue((intent.getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK) != 0);

        QuickAddWidget provider = new QuickAddWidget();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ShadowAppWidgetManager shadow = Shadows.shadowOf(manager);
        int widgetId = shadow.createWidget(QuickAddWidget.class, R.layout.widget_quick_add);
        assertTrue(widgetId > 0);
        assertNotNull(shadow.getViewFor(widgetId));
        assertNotNull(shadow.getAppWidgetProviderFor(widgetId));
        provider.onUpdate(context, manager, new int[] { widgetId });
    }

    @Test
    public void widgetReceiverAndLauncherActivityAreDeclared() {
        Context context = RuntimeEnvironment.getApplication();
        PackageManager manager = context.getPackageManager();
        Intent launch = manager.getLaunchIntentForPackage(context.getPackageName());
        assertNotNull(launch);
        assertEquals(MainActivity.class.getName(), launch.getComponent().getClassName());

        Intent update = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        update.setPackage(context.getPackageName());
        assertTrue(manager.queryBroadcastReceivers(update, 0).size() > 0);
    }
}
