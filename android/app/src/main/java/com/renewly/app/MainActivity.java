package com.renewly.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra(QuickAddNavigation.EXTRA_QUICK_ADD, false)) {
            intent.removeExtra(QuickAddNavigation.EXTRA_QUICK_ADD);
            openExpenseTracker();
        }
    }

    private void openExpenseTracker() {
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        final String url = QuickAddNavigation.expensesUrl(bridge.getLocalUrl());
        bridge.getWebView().postDelayed(() -> bridge.getWebView().loadUrl(url), 350);
    }
}
