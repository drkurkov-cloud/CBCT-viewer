# CBCT Viewer Portable — v0.3

The primary release target is now a portable Windows x64 dental CBCT/DICOM viewer. The existing native macOS v0.2 prototype remains in `Sources/` as a reference implementation of the shared geometry rules.

## Windows portable MVP

- Runs from `CBCT Viewer.exe` without installation or administrator rights.
- Stores its library in `Data/Studies` beside the executable, suitable for a USB drive.
- Import Hub supports cloud/email links, CD/DVD, USB, local and network folders, ZIP and 7z archives.
- Recursively detects DICOM, groups compatible series, and selects the largest CT/CBCT volume.
- Copies DICOM files byte-for-byte without renaming them; study folders use `Patient Name_YYYY-MM-DD`.
- Shows full patient name and study date in the library and patient strip.
- Cornerstone3D MPR: axial, coronal and sagittal planes with synchronized crosshair, WL/WW, pan, zoom, scrolling and length measurements.
- Dental workspace: automatic dental curve, panoramic reconstruction and movable cross-section.
- A separate disabled licensing module is retained for future activation.

The verified artifact is produced by `.github/workflows/windows-portable.yml` as `CBCT_Viewer_USB_Package.zip`. CI validates TypeScript, geometry/domain tests, x64 PE architecture, application startup, ZIP contents and production dependency licenses.

## Earlier macOS prototype

Independent native macOS prototype of a dental CBCT/DICOM viewer. RadiAnt is used only as a functional/interaction reference; no proprietary source code or UI assets are used.

## What works in v0.2
- Native macOS SwiftUI/AppKit interface
- Open a folder containing a DICOM/CBCT study
- Recursively detect DICOM image series and load the largest compatible series
- Axial / coronal / sagittal MPR
- Correct physical MPR aspect using voxel spacing
- Slice browsing with mouse wheel and drag
- Window/Level by tool drag, sliders and Bone/Soft presets
- Trackpad pinch zoom, Pan and Zoom tools
- Length measurement in millimeters in all three MPR planes
- Patient / study / series summary in the sidebar
- Built-in synthetic demo volume for testing without patient data
- Shared C++20 imaging core behind the native macOS UI

## Run it on a Mac
Requirements: **macOS 14+** and Xcode (or Xcode Command Line Tools with the macOS SDK).

### Simplest method
1. Unzip the project on the Mac.
2. Double-click `BUILD_AND_RUN.command`.
3. The script builds a local `build/CBCT Viewer.app` and opens it.

If macOS blocks the `.command` file the first time, Control-click it and choose **Open**.

### Xcode method
Double-click `OPEN_IN_XCODE.command`, or open `Package.swift` directly in Xcode. Select the `CBCTViewerMac` scheme and **My Mac**, then press Run.

## DICOM support in this version
v0.2 intentionally has a small dependency-free DICOM reader so the architecture can be tested immediately.

Supported now:
- Explicit VR Little Endian
- Implicit VR Little Endian
- uncompressed MONOCHROME1/MONOCHROME2 grayscale containers (display tuning is optimized for normal CT/CBCT MONOCHROME2)
- 8-bit and 16-bit pixels
- single-frame series and straightforward multi-frame pixel data
- rescale slope/intercept, pixel spacing and slice spacing

Not yet supported:
- JPEG / JPEG-LS / JPEG2000 / RLE encapsulated DICOM
- advanced Enhanced CT per-frame functional groups
- DICOMDIR/PACS/DICOMweb

For production, v0.3 should replace/augment the minimal parser with DCMTK/GDCM codecs.

## Controls
- Mouse wheel: change slice
- **Browse** + drag: change slice
- **WL/WW** + drag: horizontal = width, vertical = level
- **Pan** + drag: pan
- **Zoom** + drag or trackpad pinch: zoom
- **Length** + drag: measurement in mm
- Double-click a viewport: reset zoom/pan

## Architecture
`SwiftUI/AppKit shell → C ABI → C++20 imaging core → DICOM/volume/MPR math`

The next targets can use the same C++ core with native shells:
- Windows: WinUI 3 / Fluent
- iOS/iPadOS: SwiftUI/UIKit

## Important
This is a development prototype and **not a certified medical device**. It must not be used as the sole basis for diagnosis or treatment decisions.
