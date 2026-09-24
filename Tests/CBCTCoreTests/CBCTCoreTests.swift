import XCTest
import CBCTCore

final class CBCTCoreTests: XCTestCase {
    func testDemoVolumeGeometryAndSlices() throws {
        guard let volume = cbct_create_demo_volume() else {
            XCTFail("Demo volume was not created")
            return
        }
        defer { cbct_volume_destroy(volume) }

        XCTAssertGreaterThan(cbct_volume_width(volume), 0)
        XCTAssertGreaterThan(cbct_volume_height(volume), 0)
        XCTAssertGreaterThan(cbct_volume_depth(volume), 0)
        XCTAssertEqual(cbct_volume_spacing_x(volume), 0.40, accuracy: 0.0001)
        XCTAssertEqual(cbct_volume_spacing_y(volume), 0.40, accuracy: 0.0001)
        XCTAssertEqual(cbct_volume_spacing_z(volume), 0.50, accuracy: 0.0001)

        let w = Int(cbct_volume_width(volume))
        let h = Int(cbct_volume_height(volume))
        let d = Int(cbct_volume_depth(volume))

        var outW: Int = 0
        var outH: Int = 0
        var axial = [UInt8](repeating: 0, count: w * h)
        let axialOK = axial.withUnsafeMutableBufferPointer { buffer in
            cbct_extract_slice_u8_i(
                volume, 0, d / 2, 2500, 500,
                buffer.baseAddress, buffer.count,
                &outW, &outH
            )
        }
        XCTAssertEqual(axialOK, 1)
        XCTAssertEqual(outW, w)
        XCTAssertEqual(outH, h)
        XCTAssertTrue(axial.contains { $0 != 0 })
    }

    func testPhysicalDistance() {
        let distance = cbct_distance_mm(0, 0, 0, 3, 4, 0, 1, 1, 1)
        XCTAssertEqual(distance, 5.0, accuracy: 0.000001)
    }
}
