import SwiftUI
import AppKit
import CoreGraphics
import CBCTCore

enum ViewerPlane: Int, CaseIterable, Identifiable {
    case axial = 0, coronal = 1, sagittal = 2
    var id: Int { rawValue }
    var title: String {
        switch self { case .axial: return "Axial"; case .coronal: return "Coronal"; case .sagittal: return "Sagittal" }
    }
}

enum ViewerTool: String, CaseIterable, Identifiable {
    case browse = "Browse"
    case window = "WL/WW"
    case pan = "Pan"
    case zoom = "Zoom"
    case length = "Length"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .browse: return "square.stack.3d.up"
        case .window: return "circle.lefthalf.filled"
        case .pan: return "hand.draw"
        case .zoom: return "plus.magnifyingglass"
        case .length: return "ruler"
        }
    }
}

struct Measurement: Identifiable {
    let id = UUID()
    let plane: ViewerPlane
    let millimeters: Double
}

@MainActor
final class ViewerModel: ObservableObject {
    @Published var selectedTool: ViewerTool = .browse
    @Published var showInspector = true
    @Published var status = "Open a DICOM folder or load the demo volume"
    @Published var errorMessage: String?

    @Published var windowWidth: Double = 2500
    @Published var windowLevel: Double = 500

    @Published var axialIndex = 0
    @Published var coronalIndex = 0
    @Published var sagittalIndex = 0

    @Published var axialImage: CGImage?
    @Published var coronalImage: CGImage?
    @Published var sagittalImage: CGImage?

    @Published var patientName = "—"
    @Published var patientID = "—"
    @Published var studyDate = "—"
    @Published var seriesDescription = "No series"
    @Published var modality = "—"
    @Published var detectedSeriesCount = 0
    @Published var measurements: [Measurement] = []

    private var volume: OpaquePointer?
    private var defaultWindowWidth = 2500.0
    private var defaultWindowLevel = 500.0
    private(set) var width = 0
    private(set) var height = 0
    private(set) var depth = 0
    private(set) var spacingX = 1.0
    private(set) var spacingY = 1.0
    private(set) var spacingZ = 1.0

    deinit {
        if let volume { cbct_volume_destroy(volume) }
    }

    var hasVolume: Bool { volume != nil }

    func openFolder() {
        let panel = NSOpenPanel()
        panel.title = "Open DICOM Folder"
        panel.message = "Choose the folder containing the CBCT/DICOM study"
        panel.prompt = "Open"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            loadFolder(url)
        }
    }

    func loadFolder(_ url: URL) {
        status = "Reading DICOM…"
        errorMessage = nil
        var error = [CChar](repeating: 0, count: 2048)
        let newVolume: OpaquePointer? = url.path.withCString { pathPtr in
            error.withUnsafeMutableBufferPointer { buffer in
                cbct_dicom_load_folder(pathPtr, buffer.baseAddress, buffer.count)
            }
        }
        guard let newVolume else {
            errorMessage = error.withUnsafeBufferPointer { buffer in
                guard let base = buffer.baseAddress else { return "Could not read the DICOM series" }
                return String(cString: base)
            }
            status = "DICOM load failed"
            return
        }
        replaceVolume(newVolume)
        status = "Loaded \(depth) slices"
    }

    func loadDemo() {
        guard let demo = cbct_create_demo_volume() else {
            errorMessage = "Could not create demo volume"
            return
        }
        replaceVolume(demo)
        status = "Demo volume loaded"
    }

    private func replaceVolume(_ newVolume: OpaquePointer) {
        if let old = volume { cbct_volume_destroy(old) }
        volume = newVolume
        width = Int(cbct_volume_width(newVolume))
        height = Int(cbct_volume_height(newVolume))
        depth = Int(cbct_volume_depth(newVolume))
        spacingX = cbct_volume_spacing_x(newVolume)
        spacingY = cbct_volume_spacing_y(newVolume)
        spacingZ = cbct_volume_spacing_z(newVolume)
        defaultWindowWidth = cbct_volume_default_window_width(newVolume)
        defaultWindowLevel = cbct_volume_default_window_level(newVolume)
        windowWidth = defaultWindowWidth
        windowLevel = defaultWindowLevel
        axialIndex = max(0, depth / 2)
        coronalIndex = max(0, height / 2)
        sagittalIndex = max(0, width / 2)
        detectedSeriesCount = Int(cbct_volume_detected_series_count(newVolume))
        patientName = cString(cbct_volume_patient_name(newVolume), fallback: "—")
        patientID = cString(cbct_volume_patient_id(newVolume), fallback: "—")
        studyDate = formatStudyDate(cString(cbct_volume_study_date(newVolume), fallback: "—"))
        seriesDescription = cString(cbct_volume_series_description(newVolume), fallback: "DICOM series")
        modality = cString(cbct_volume_modality(newVolume), fallback: "CT")
        measurements.removeAll()
        renderAll()
    }

    private func cString(_ ptr: UnsafePointer<CChar>?, fallback: String) -> String {
        guard let ptr else { return fallback }
        let s = String(cString: ptr)
        return s.isEmpty ? fallback : s.replacingOccurrences(of: "^", with: " ")
    }

    private func formatStudyDate(_ value: String) -> String {
        guard value.count == 8 else { return value }
        let y = value.prefix(4)
        let m = value.dropFirst(4).prefix(2)
        let d = value.suffix(2)
        return "\(d).\(m).\(y)"
    }

    func maxIndex(for plane: ViewerPlane) -> Int {
        switch plane {
        case .axial: return max(0, depth - 1)
        case .coronal: return max(0, height - 1)
        case .sagittal: return max(0, width - 1)
        }
    }

    func index(for plane: ViewerPlane) -> Int {
        switch plane {
        case .axial: return axialIndex
        case .coronal: return coronalIndex
        case .sagittal: return sagittalIndex
        }
    }

    func image(for plane: ViewerPlane) -> CGImage? {
        switch plane {
        case .axial: return axialImage
        case .coronal: return coronalImage
        case .sagittal: return sagittalImage
        }
    }

    func imageSpacing(for plane: ViewerPlane) -> (Double, Double) {
        switch plane {
        case .axial: return (spacingX, spacingY)
        case .coronal: return (spacingX, spacingZ)
        case .sagittal: return (spacingY, spacingZ)
        }
    }

    func stepSlice(_ plane: ViewerPlane, delta: Int) {
        guard hasVolume, delta != 0 else { return }
        switch plane {
        case .axial:
            axialIndex = min(max(axialIndex + delta, 0), maxIndex(for: .axial))
        case .coronal:
            coronalIndex = min(max(coronalIndex + delta, 0), maxIndex(for: .coronal))
        case .sagittal:
            sagittalIndex = min(max(sagittalIndex + delta, 0), maxIndex(for: .sagittal))
        }
        render(plane)
    }

    func setIndex(_ plane: ViewerPlane, _ value: Int) {
        let v = min(max(value, 0), maxIndex(for: plane))
        switch plane { case .axial: axialIndex = v; case .coronal: coronalIndex = v; case .sagittal: sagittalIndex = v }
        render(plane)
    }

    func adjustWindow(deltaWidth: Double, deltaLevel: Double) {
        windowWidth = max(1, min(20000, windowWidth + deltaWidth))
        windowLevel = max(-10000, min(20000, windowLevel + deltaLevel))
        renderAll()
    }

    func setWindow(width: Double? = nil, level: Double? = nil) {
        if let width { windowWidth = max(1, width) }
        if let level { windowLevel = level }
        renderAll()
    }

    func addMeasurement(plane: ViewerPlane, millimeters: Double) {
        measurements.append(Measurement(plane: plane, millimeters: millimeters))
    }

    func clearMeasurements() { measurements.removeAll() }

    func resetWindow() {
        windowWidth = defaultWindowWidth
        windowLevel = defaultWindowLevel
        renderAll()
    }

    func renderAll() {
        guard hasVolume else { return }
        render(.axial); render(.coronal); render(.sagittal)
    }

    private func render(_ plane: ViewerPlane) {
        guard let volume else { return }
        var outWidth: Int = 0
        var outHeight: Int = 0
        let idx = index(for: plane)
        _ = cbct_extract_slice_u8_i(volume, Int32(plane.rawValue), idx, windowWidth, windowLevel, nil, 0, &outWidth, &outHeight)
        guard outWidth > 0, outHeight > 0 else { return }
        var pixels = [UInt8](repeating: 0, count: outWidth * outHeight)
        let rc = pixels.withUnsafeMutableBufferPointer { buffer in
            cbct_extract_slice_u8_i(volume, Int32(plane.rawValue), idx, windowWidth, windowLevel, buffer.baseAddress, buffer.count, &outWidth, &outHeight)
        }
        guard rc == 0 else { return }
        let data = Data(pixels) as CFData
        guard let provider = CGDataProvider(data: data),
              let image = CGImage(width: outWidth,
                                  height: outHeight,
                                  bitsPerComponent: 8,
                                  bitsPerPixel: 8,
                                  bytesPerRow: outWidth,
                                  space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                                  provider: provider,
                                  decode: nil,
                                  shouldInterpolate: false,
                                  intent: .defaultIntent) else { return }
        switch plane { case .axial: axialImage = image; case .coronal: coronalImage = image; case .sagittal: sagittalImage = image }
    }
}
