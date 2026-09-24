# Architecture — v0.2

## Layers
1. **macOS UI (SwiftUI + AppKit)**
   - NavigationSplitView sidebar
   - native unified toolbar
   - grouped inspector
   - AppKit diagnostic canvas for mouse/trackpad events
2. **C ABI**
   - stable procedural boundary between platform UI and engine
   - keeps Windows/iOS front ends independent from C++ implementation details
3. **C++20 imaging core**
   - volume ownership and physical voxel spacing
   - DICOM series import
   - window/level
   - orthogonal MPR
   - physical measurements
4. **Future renderer/services**
   - Metal 3D volume renderer on Apple
   - Direct3D renderer on Windows
   - DCMTK/GDCM codecs and PACS/DICOMweb
   - SQLite study index/cache

## Cross-platform direction
The core stays shared. OS chrome and interaction stay native:
- macOS: SwiftUI/AppKit, SF Symbols, standard toolbars/material/sidebar behavior
- Windows: WinUI 3, Fluent controls, Mica shell
- iOS/iPadOS: SwiftUI/UIKit, touch-first tool strip and gestures

No UI imitation layer is planned; every platform receives its own interface implementation.
