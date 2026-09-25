package io.github.darrenintr.timing;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TimingWidget")
public class TimingWidgetPlugin extends Plugin {
    private static final String HANDLED = "io.github.darrenintr.timing.widget.HANDLED";

    // A widget tap that launched the app is on the starting intent.
    @Override public void load() {
        if (getActivity() != null) forward(getActivity().getIntent());
    }

    @Override protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        forward(intent);
    }

    private void forward(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getBooleanExtra(HANDLED, false)) return;
        Uri data = intent.getData();
        if (data == null || !"timing".equals(data.getScheme())) return;
        intent.putExtra(HANDLED, true);
        JSObject event = new JSObject();
        event.put("url", data.toString());
        notifyListeners("open", event, true);
    }

    @PluginMethod public void update(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("Missing widget data"); return; }
        TimingSchool.store(getContext(), data);
        TimingWidgetProvider.updateAll(getContext());
        call.resolve(new JSObject());
    }

    // Homework ticked off on a widget, handed to the app once.
    @PluginMethod public void takeCompleted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ids", TimingSchool.takeCompleted(getContext()));
        call.resolve(result);
    }
}
