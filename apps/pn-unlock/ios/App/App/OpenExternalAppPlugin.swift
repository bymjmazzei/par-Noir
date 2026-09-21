import Foundation
import UIKit
import Capacitor

/**
 * Cap `@capacitor/app` has no openUrl on iOS. Prefer-app must return to Messages/Browse
 * via UIApplication.open after broker-complete.
 */
@objc(OpenExternalAppPlugin)
public class OpenExternalAppPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OpenExternalAppPlugin"
    public let jsName = "OpenExternalApp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve()
                } else {
                    call.reject("Could not open URL")
                }
            }
        }
    }
}
