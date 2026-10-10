package com.biteric.finance;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * window.print() is a no-op inside an Android WebView. This hands the current
 * page to the system print dialog, which includes "Save as PDF".
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String jobName = call.getString("name", "BitEric Finance");
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
            printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
            call.resolve();
        });
    }
}
