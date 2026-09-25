import Capacitor
import WidgetKit

@objc(TimingWidgetPlugin)
public class TimingWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TimingWidgetPlugin"
    public let jsName = "TimingWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)
    ]

    @objc func update(_ call: CAPPluginCall) {
        guard let data = call.getString("data") else {
            call.reject("Missing widget data")
            return
        }
        guard let defaults = UserDefaults(suiteName: "group.io.github.darrenintr.timing") else {
            call.reject("Timing widget App Group is unavailable")
            return
        }
        defaults.set(data, forKey: "snapshot")
        WidgetCenter.shared.reloadTimelines(ofKind: "TimingSchedule")
        call.resolve()
    }
}
