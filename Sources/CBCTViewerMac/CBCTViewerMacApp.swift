import SwiftUI

extension Notification.Name {
    static let openDICOMFolder = Notification.Name("CBCTViewer.openDICOMFolder")
    static let selectViewerTool = Notification.Name("CBCTViewer.selectViewerTool")
    static let resetWindowLevel = Notification.Name("CBCTViewer.resetWindowLevel")
}

@main
struct CBCTViewerMacApp: App {
    var body: some Scene {
        WindowGroup("CBCT Viewer") {
            ContentView()
        }
        .windowStyle(.titleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open DICOM Folder…") {
                    NotificationCenter.default.post(name: .openDICOMFolder, object: nil)
                }
                .keyboardShortcut("o", modifiers: [.command])
            }
            CommandMenu("Tools") {
                toolCommand("Browse", key: "b")
                toolCommand("WL/WW", key: "w")
                toolCommand("Pan", key: "m")
                toolCommand("Zoom", key: "z")
                toolCommand("Length", key: "l")
                Divider()
                Button("Reset Window / Level") {
                    NotificationCenter.default.post(name: .resetWindowLevel, object: nil)
                }
                .keyboardShortcut("0", modifiers: [])
            }
        }
    }

    private func toolCommand(_ tool: String, key: KeyEquivalent) -> some View {
        Button(tool) {
            NotificationCenter.default.post(name: .selectViewerTool, object: tool)
        }
        .keyboardShortcut(key, modifiers: [])
    }
}
