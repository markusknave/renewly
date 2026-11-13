package com.renewly.app;

import android.content.Context;
import android.content.Intent;

final class QuickAddNavigation {

    static final String EXTRA_QUICK_ADD = "com.renewly.app.QUICK_ADD";

    private QuickAddNavigation() {}

    static Intent intent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra(EXTRA_QUICK_ADD, true);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }

    static String expensesUrl(String base) {
        String root = base == null || base.isEmpty() ? "https://localhost" : base;
        if (root.endsWith("/")) {
            root = root.substring(0, root.length() - 1);
        }
        return root + "/#/expenses?new=1";
    }
}
