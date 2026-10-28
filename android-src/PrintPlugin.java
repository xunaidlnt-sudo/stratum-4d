package com.miqyaslabs.stratum4d;

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
 * Prints the app's page with Android's print service (printers, Save as PDF),
 * since the Android web view has no window.print(). The page's print
 * stylesheet applies, as in a browser.
 */
@CapacitorPlugin(name = "StratumPrint")
public class PrintPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        final String name = call.getString("name", "Stratum 4D");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                WebView view = getBridge().getWebView();
                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
                pm.print(name, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Printing failed: " + e.getMessage());
            }
        });
    }
}
