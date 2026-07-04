package com.habit.tracker;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private WebView webView;
    private static final String APP_URL = "https://ghostfeng0701.github.io/-/";
    private static final String TAG = "HabitTracker";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 无标题，沉浸式
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(0xFF0A0E17);
        getWindow().setNavigationBarColor(0xFF0A0E17);

        // 创建WebView
        webView = new WebView(this);
        setContentView(webView);

        // 配置WebView
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setGeolocationEnabled(false);

        // 设置User-Agent
        String userAgent = settings.getUserAgentString();
        settings.setUserAgentString(userAgent + " HabitTracker/2.1");

        // 允许JavaScript打开窗口（mailto等）
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        // 添加JS桥接：邮件导出
        webView.addJavascriptInterface(new EmailExportBridge(), "HabitTrackerAndroid");

        // WebViewClient - 在应用内加载
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // 邮件协议交给系统处理
                if (url.startsWith("mailto:")) {
                    Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse(url));
                    startActivity(Intent.createChooser(intent, "发送邮件"));
                    return true;
                }
                // 应用内域名直接加载
                if (url.startsWith("https://ghostfeng0701.github.io") ||
                    url.startsWith("https://webview.e2b")) {
                    view.loadUrl(url);
                    return true;
                }
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        // 处理安全区（状态栏/导航栏内边距）
        webView.setOnApplyWindowInsetsListener((v, insets) -> {
            int topInset = insets.getSystemWindowInsetTop();
            int bottomInset = insets.getSystemWindowInsetBottom();
            v.setPadding(v.getPaddingLeft(), topInset, v.getPaddingRight(), bottomInset);
            return insets;
        });

        // 加载应用
        webView.loadUrl(APP_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /**
     * JavaScript桥接：提供邮件导出功能
     */
    public class EmailExportBridge {
        @JavascriptInterface
        public void exportDataViaEmail(String jsonData, String date) {
            runOnUiThread(() -> {
                try {
                    String subject = "日积跬步数据备份 " + date;
                    String body = "这是我的日积跬步数据备份，请妥善保存。\n\n" + jsonData;

                    // 使用 mailto 打开邮件客户端
                    String mailto = "mailto:?" +
                        "subject=" + Uri.encode(subject) +
                        "&body=" + Uri.encode(body);

                    Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse(mailto));
                    startActivity(Intent.createChooser(intent, "发送备份到邮箱"));
                    Log.i(TAG, "Email export intent launched");
                } catch (Exception e) {
                    Log.e(TAG, "Export failed", e);
                }
            });
        }

        @JavascriptInterface
        public boolean isAndroidApp() {
            return true;
        }
    }
}
