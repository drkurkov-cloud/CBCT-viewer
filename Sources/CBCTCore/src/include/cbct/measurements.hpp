#pragma once
#include "volume.hpp"

namespace cbct {

struct VoxelPoint {
    double x{};
    double y{};
    double z{};
};

[[nodiscard]] double distance_mm(VoxelPoint a, VoxelPoint b, SpacingMm spacing) noexcept;

} // namespace cbct
