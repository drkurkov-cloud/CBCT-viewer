#include "cbct/measurements.hpp"
#include <cmath>

namespace cbct {

double distance_mm(VoxelPoint a, VoxelPoint b, SpacingMm s) noexcept {
    const double dx = (a.x - b.x) * s.x;
    const double dy = (a.y - b.y) * s.y;
    const double dz = (a.z - b.z) * s.z;
    return std::sqrt(dx * dx + dy * dy + dz * dz);
}

} // namespace cbct
