package io.github.darrenintr.timing;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TimingWidget")
public class TimingWidgetPlugin extends Plugin {
    @PluginMethod public void update(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("Missing widget data"); return; }
        getContext().getSharedPreferences("timing-widget", 0).edit().putString("data", data).apply();
        TimingWidgetProvider.updateAll(getContext());
        call.resolve(new JSObject());
    }
}
