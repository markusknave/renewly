package com.renewly.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String EXTRA_QUICK_ADD = "com.renewly.app.QUICK_ADD";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra(EXTRA_QUICK_ADD, false)) {
            intent.removeExtra(EXTRA_QUICK_ADD);
            openExpenseTracker();
        }
    }

    private void openExpenseTracker() {
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        String base = bridge.getLocalUrl();
        if (base == null || base.isEmpty()) {
            base = "https://localhost";
        }
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        final String url = base + "/#/expenses?new=1";
        bridge.getWebView().postDelayed(() -> bridge.getWebView().loadUrl(url), 350);
    }
}
