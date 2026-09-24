#pragma once
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <vector>

namespace cbct {

struct Dimensions {
    std::size_t width{};   // X / columns
    std::size_t height{};  // Y / rows
    std::size_t depth{};   // Z / slices
};

struct SpacingMm {
    double x{1.0};
    double y{1.0};
    double z{1.0};
};

class Volume {
public:
    Volume(Dimensions dims, SpacingMm spacing, std::vector<std::int16_t> voxels);

    [[nodiscard]] const Dimensions& dims() const noexcept { return dims_; }
    [[nodiscard]] const SpacingMm& spacing() const noexcept { return spacing_; }
    [[nodiscard]] const std::vector<std::int16_t>& voxels() const noexcept { return voxels_; }
    [[nodiscard]] std::int16_t at(std::size_t x, std::size_t y, std::size_t z) const;
    [[nodiscard]] std::size_t voxel_count() const noexcept;

private:
    Dimensions dims_;
    SpacingMm spacing_;
    std::vector<std::int16_t> voxels_;
};

} // namespace cbct
