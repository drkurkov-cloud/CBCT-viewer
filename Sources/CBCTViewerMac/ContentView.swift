import SwiftUI

struct ContentView: View {
    @StateObject private var model = ViewerModel()

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationSplitViewColumnWidth(min: 190, ideal: 230, max: 300)
        } detail: {
            HSplitView {
                viewerGrid
                if model.showInspector { inspector.frame(minWidth: 250, idealWidth: 285, maxWidth: 330) }
            }
            .background(Color.black)
            .toolbar { toolbar }
        }
        .frame(minWidth: 1100, minHeight: 720)
        .onReceive(NotificationCenter.default.publisher(for: .openDICOMFolder)) { _ in model.openFolder() }
        .onReceive(NotificationCenter.default.publisher(for: .selectViewerTool)) { note in
            if let raw = note.object as? String, let tool = ViewerTool(rawValue: raw) { model.selectedTool = tool }
        }
        .onReceive(NotificationCenter.default.publisher(for: .resetWindowLevel)) { _ in model.resetWindow() }
        .alert("DICOM Import", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: { Text(model.errorMessage ?? "Unknown error") }
    }

    private var sidebar: some View {
        List {
            Section("Study") {
                LabeledContent("Patient", value: model.patientName)
                LabeledContent("ID", value: model.patientID)
                LabeledContent("Date", value: model.studyDate)
            }
            Section("Series") {
                Label(model.seriesDescription, systemImage: "square.stack.3d.up")
                if model.detectedSeriesCount > 1 {
                    Text("\(model.detectedSeriesCount) series detected; largest loaded")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Section("Volume") {
                LabeledContent("Matrix", value: "\(model.width) × \(model.height) × \(model.depth)")
                LabeledContent("Voxel", value: String(format: "%.2f × %.2f × %.2f mm", model.spacingX, model.spacingY, model.spacingZ))
                LabeledContent("Modality", value: model.modality)
            }
            Section {
                Button("Open DICOM Folder…") { model.openFolder() }
                Button("Load Demo Volume") { model.loadDemo() }
            }
        }
        .listStyle(.sidebar)
    }

    private var viewerGrid: some View {
        Grid(horizontalSpacing: 1, verticalSpacing: 1) {
            GridRow {
                canvas(.axial)
                canvas(.coronal)
            }
            GridRow {
                canvas(.sagittal)
                ZStack {
                    Color.black
                    VStack(spacing: 10) {
                        Image(systemName: "cube.transparent")
                            .font(.system(size: 44, weight: .thin))
                            .foregroundStyle(.secondary)
                        Text("3D Volume Rendering")
                            .foregroundStyle(.secondary)
                        Text("planned for v0.3")
                            .font(.caption).foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .padding(1)
    }

    @ViewBuilder
    private func canvas(_ plane: ViewerPlane) -> some View {
        DiagnosticCanvas(
            plane: plane,
            image: model.image(for: plane),
            sliceIndex: model.index(for: plane),
            maxSliceIndex: model.maxIndex(for: plane),
            tool: model.selectedTool,
            spacing: model.imageSpacing(for: plane),
            windowWidth: model.windowWidth,
            windowLevel: model.windowLevel,
            onSliceStep: { model.stepSlice(plane, delta: $0) },
            onWindowDelta: { model.adjustWindow(deltaWidth: $0, deltaLevel: $1) },
            onMeasurement: { model.addMeasurement(plane: plane, millimeters: $0) }
        )
        .overlay(alignment: .topTrailing) {
            if model.hasVolume {
                Slider(value: Binding(
                    get: { Double(model.index(for: plane)) },
                    set: { model.setIndex(plane, Int($0.rounded())) }
                ), in: 0...Double(max(1, model.maxIndex(for: plane))))
                .controlSize(.mini)
                .frame(width: 115)
                .padding(8)
                .opacity(0.55)
            }
        }
    }

    private var inspector: some View {
        Form {
            Section("Window / Level") {
                LabeledContent("Level", value: Int(model.windowLevel).formatted())
                Slider(value: Binding(get: { model.windowLevel }, set: { model.setWindow(level: $0) }), in: -2000...3000)
                LabeledContent("Width", value: Int(model.windowWidth).formatted())
                Slider(value: Binding(get: { model.windowWidth }, set: { model.setWindow(width: $0) }), in: 1...6000)
                HStack {
                    Button("Bone") { model.setWindow(width: 2500, level: 500) }
                    Button("Soft") { model.setWindow(width: 400, level: 50) }
                }
            }
            Section("Measurements") {
                if model.measurements.isEmpty {
                    Text("No measurements").foregroundStyle(.secondary)
                } else {
                    ForEach(model.measurements) { item in
                        LabeledContent(item.plane.title, value: String(format: "%.2f mm", item.millimeters))
                    }
                    Button("Clear", role: .destructive) { model.clearMeasurements() }
                }
            }
            Section("Status") {
                Text(model.status).font(.caption).foregroundStyle(.secondary)
                Text("Mouse wheel: slices\nDouble-click: reset zoom/pan\nTrackpad pinch: zoom")
                    .font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .formStyle(.grouped)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .principal) {
            Picker("Tool", selection: $model.selectedTool) {
                ForEach(ViewerTool.allCases) { tool in
                    Label(tool.rawValue, systemImage: tool.symbol).tag(tool)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 470)
        }
        ToolbarItemGroup {
            Button { model.openFolder() } label: { Label("Open", systemImage: "folder") }
            Button { model.showInspector.toggle() } label: { Image(systemName: "sidebar.trailing") }
        }
    }
}
