#include "cbct/volume.hpp"
#include <limits>

namespace cbct {

static std::size_t checked_count(Dimensions d) {
    if (d.width == 0 || d.height == 0 || d.depth == 0) {
        throw std::invalid_argument("Volume dimensions must be non-zero");
    }
    if (d.width > std::numeric_limits<std::size_t>::max() / d.height ||
        d.width * d.height > std::numeric_limits<std::size_t>::max() / d.depth) {
        throw std::overflow_error("Volume dimensions overflow");
    }
    return d.width * d.height * d.depth;
}

Volume::Volume(Dimensions dims, SpacingMm spacing, std::vector<std::int16_t> voxels)
    : dims_(dims), spacing_(spacing), voxels_(std::move(voxels)) {
    const auto expected = checked_count(dims_);
    if (spacing_.x <= 0 || spacing_.y <= 0 || spacing_.z <= 0) {
        throw std::invalid_argument("Voxel spacing must be positive");
    }
    if (voxels_.size() != expected) {
        throw std::invalid_argument("Voxel count does not match dimensions");
    }
}

std::int16_t Volume::at(std::size_t x, std::size_t y, std::size_t z) const {
    if (x >= dims_.width || y >= dims_.height || z >= dims_.depth) {
        throw std::out_of_range("Voxel coordinate out of range");
    }
    return voxels_[(z * dims_.height + y) * dims_.width + x];
}

std::size_t Volume::voxel_count() const noexcept {
    return dims_.width * dims_.height * dims_.depth;
}

} // namespace cbct
