#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>
#include "volume.hpp"
#include "window_level.hpp"

namespace cbct {

enum class Plane { Axial, Coronal, Sagittal };

struct Image8 {
    std::size_t width{};
    std::size_t height{};
    std::vector<std::uint8_t> pixels;
};

[[nodiscard]] Image8 extract_orthogonal_slice(
    const Volume& volume,
    Plane plane,
    std::size_t index,
    WindowLevel wl);

} // namespace cbct
