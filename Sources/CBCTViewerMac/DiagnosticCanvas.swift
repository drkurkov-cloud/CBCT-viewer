import SwiftUI
import AppKit
import CoreGraphics

struct DiagnosticCanvas: NSViewRepresentable {
    let plane: ViewerPlane
    let image: CGImage?
    let sliceIndex: Int
    let maxSliceIndex: Int
    let tool: ViewerTool
    let spacing: (Double, Double)
    let windowWidth: Double
    let windowLevel: Double
    let onSliceStep: (Int) -> Void
    let onWindowDelta: (Double, Double) -> Void
    let onMeasurement: (Double) -> Void

    func makeNSView(context: Context) -> DiagnosticNSView {
        let view = DiagnosticNSView()
        apply(to: view)
        return view
    }

    func updateNSView(_ nsView: DiagnosticNSView, context: Context) { apply(to: nsView) }

    private func apply(to view: DiagnosticNSView) {
        view.image = image
        view.title = plane.title
        view.sliceIndex = sliceIndex
        view.maxSliceIndex = maxSliceIndex
        view.tool = tool
        view.spacing = spacing
        view.windowWidth = windowWidth
        view.windowLevel = windowLevel
        view.onSliceStep = onSliceStep
        view.onWindowDelta = onWindowDelta
        view.onMeasurement = onMeasurement
        view.needsDisplay = true
    }
}

final class DiagnosticNSView: NSView {
    var image: CGImage?
    var title = ""
    var sliceIndex = 0
    var maxSliceIndex = 0
    var tool: ViewerTool = .browse
    var spacing: (Double, Double) = (1, 1)
    var windowWidth = 2500.0
    var windowLevel = 500.0
    var onSliceStep: ((Int) -> Void)?
    var onWindowDelta: ((Double, Double) -> Void)?
    var onMeasurement: ((Double) -> Void)?

    private var zoom: CGFloat = 1
    private var pan = CGPoint.zero
    private var lastPoint: CGPoint?
    private var measureStart: CGPoint?
    private var measureEnd: CGPoint?
    private var browseAccumulator: CGFloat = 0

    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        NSColor.black.setFill()
        bounds.fill()
        guard let image, let ctx = NSGraphicsContext.current?.cgContext else {
            drawEmptyState(); return
        }
        let rect = imageRect(image)
        ctx.interpolationQuality = .none
        ctx.saveGState()
        ctx.translateBy(x: 0, y: bounds.height)
        ctx.scaleBy(x: 1, y: -1)
        let flipped = CGRect(x: rect.minX, y: bounds.height - rect.maxY, width: rect.width, height: rect.height)
        ctx.draw(image, in: flipped)
        ctx.restoreGState()
        drawOverlay(rect: rect)
    }

    private func imageRect(_ image: CGImage) -> CGRect {
        let iw = CGFloat(image.width) * CGFloat(max(spacing.0, 0.0001))
        let ih = CGFloat(image.height) * CGFloat(max(spacing.1, 0.0001))
        guard iw > 0, ih > 0 else { return .zero }
        let base = min(bounds.width / iw, bounds.height / ih)
        let scale = base * zoom
        let size = CGSize(width: iw * scale, height: ih * scale)
        return CGRect(x: bounds.midX - size.width/2 + pan.x,
                      y: bounds.midY - size.height/2 + pan.y,
                      width: size.width, height: size.height)
    }

    private func drawOverlay(rect: CGRect) {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .medium),
            .foregroundColor: NSColor.white.withAlphaComponent(0.86)
        ]
        let small: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 10, weight: .regular),
            .foregroundColor: NSColor.white.withAlphaComponent(0.62)
        ]
        NSAttributedString(string: title, attributes: attrs).draw(at: CGPoint(x: 10, y: bounds.height - 24))
        NSAttributedString(string: "\(sliceIndex + 1) / \(maxSliceIndex + 1)", attributes: small).draw(at: CGPoint(x: 10, y: 10))
        let wl = "WL \(Int(windowLevel.rounded()))   WW \(Int(windowWidth.rounded()))"
        let wlString = NSAttributedString(string: wl, attributes: small)
        wlString.draw(at: CGPoint(x: bounds.width - wlString.size().width - 10, y: 10))

        if let start = measureStart, let end = measureEnd {
            let path = NSBezierPath()
            path.move(to: start); path.line(to: end)
            path.lineWidth = 1.5
            NSColor.systemYellow.setStroke(); path.stroke()
            if let image, rect.width > 0, rect.height > 0 {
                let dx = Double((end.x-start.x) / rect.width * CGFloat(image.width)) * spacing.0
                let dy = Double((end.y-start.y) / rect.height * CGFloat(image.height)) * spacing.1
                let mm = hypot(dx, dy)
                let text = NSAttributedString(string: String(format: "%.2f mm", mm), attributes: attrs)
                text.draw(at: CGPoint(x: end.x + 7, y: end.y + 7))
            }
        }
    }

    private func drawEmptyState() {
        let text = NSAttributedString(string: "No image", attributes: [
            .font: NSFont.systemFont(ofSize: 15, weight: .medium),
            .foregroundColor: NSColor.secondaryLabelColor
        ])
        text.draw(at: CGPoint(x: bounds.midX - text.size().width/2, y: bounds.midY - 8))
    }

    override func scrollWheel(with event: NSEvent) {
        let delta = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY : event.deltaY * 5
        browseAccumulator += delta
        if abs(browseAccumulator) >= 2.5 {
            let step = browseAccumulator > 0 ? 1 : -1
            onSliceStep?(step)
            browseAccumulator = 0
        }
    }

    override func magnify(with event: NSEvent) {
        zoom = min(8, max(0.2, zoom * (1 + event.magnification)))
        needsDisplay = true
    }


    override func rightMouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        lastPoint = convert(event.locationInWindow, from: nil)
    }

    override func rightMouseDragged(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        guard let last = lastPoint else { lastPoint = p; return }
        let dy = p.y - last.y
        zoom = min(8, max(0.2, zoom * (1 + dy / 180)))
        lastPoint = p
        needsDisplay = true
    }

    override func rightMouseUp(with event: NSEvent) { lastPoint = nil }

    override func otherMouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        lastPoint = convert(event.locationInWindow, from: nil)
    }

    override func otherMouseDragged(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        guard let last = lastPoint else { lastPoint = p; return }
        let dx = p.x - last.x, dy = p.y - last.y
        if event.buttonNumber == 2 {
            onWindowDelta?(Double(dx) * 8, Double(dy) * 8)
        } else {
            pan.x += dx; pan.y += dy; needsDisplay = true
        }
        lastPoint = p
    }

    override func otherMouseUp(with event: NSEvent) { lastPoint = nil }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        let p = convert(event.locationInWindow, from: nil)
        lastPoint = p
        if event.clickCount == 2 {
            zoom = 1; pan = .zero; measureStart = nil; measureEnd = nil; needsDisplay = true; return
        }
        if tool == .length {
            measureStart = p; measureEnd = p; needsDisplay = true
        }
    }

    override func mouseDragged(with event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        guard let last = lastPoint else { lastPoint = p; return }
        let dx = p.x - last.x, dy = p.y - last.y
        switch tool {
        case .browse:
            browseAccumulator += dy
            if abs(browseAccumulator) > 5 {
                onSliceStep?(browseAccumulator > 0 ? 1 : -1)
                browseAccumulator = 0
            }
        case .window:
            onWindowDelta?(Double(dx) * 8, Double(dy) * 8)
        case .pan:
            pan.x += dx; pan.y += dy; needsDisplay = true
        case .zoom:
            zoom = min(8, max(0.2, zoom * (1 + dy / 180))); needsDisplay = true
        case .length:
            measureEnd = p; needsDisplay = true
        }
        lastPoint = p
    }

    override func mouseUp(with event: NSEvent) {
        defer { lastPoint = nil }
        guard tool == .length, let start = measureStart, let end = measureEnd, let image else { return }
        let rect = imageRect(image)
        guard rect.width > 0, rect.height > 0 else { return }
        let dx = Double((end.x-start.x) / rect.width * CGFloat(image.width)) * spacing.0
        let dy = Double((end.y-start.y) / rect.height * CGFloat(image.height)) * spacing.1
        let mm = hypot(dx, dy)
        if mm > 0.05 { onMeasurement?(mm) }
    }
}
