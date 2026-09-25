import Capacitor

class TimingViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(TimingWidgetPlugin())
    }
}
