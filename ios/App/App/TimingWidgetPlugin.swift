import Capacitor
import WidgetKit

@objc(TimingWidgetPlugin)
public class TimingWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TimingWidgetPlugin"
    public let jsName = "TimingWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeCompleted", returnType: CAPPluginReturnPromise)
    ]
    private let defaults = UserDefaults(suiteName: "group.io.github.darrenintr.timing")

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(openURL(_:)), name: .capacitorOpenURL, object: nil)
        // A widget tap that launched the app arrives before this plugin loads.
        if let url = ApplicationDelegateProxy.shared.lastURL { forward(url) }
    }

    @objc func openURL(_ notification: Notification) {
        guard let object = notification.object as? [String: Any], let url = object["url"] as? URL else { return }
        forward(url)
    }

    private func forward(_ url: URL) {
        guard url.scheme == "timing" else { return }
        notifyListeners("open", data: ["url": url.absoluteString], retainUntilConsumed: true)
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let data = call.getString("data") else {
            call.reject("Missing widget data")
            return
        }
        guard let defaults else {
            call.reject("Timing widget App Group is unavailable")
            return
        }
        defaults.set(data, forKey: "snapshot")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    // Homework ticked off on a widget, handed to the app once.
    @objc func takeCompleted(_ call: CAPPluginCall) {
        let ids = defaults?.stringArray(forKey: "completed") ?? []
        defaults?.removeObject(forKey: "completed")
        call.resolve(["ids": ids])
    }
}
