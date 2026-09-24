#include "cbct/window_level.hpp"
#include <algorithm>
#include <cmath>

namespace cbct {

std::uint8_t apply_window_level(std::int16_t value, WindowLevel wl) noexcept {
    if (wl.width < 1.0) wl.width = 1.0;
    const double low = wl.level - wl.width / 2.0;
    const double high = wl.level + wl.width / 2.0;
    const double normalized = (static_cast<double>(value) - low) / (high - low);
    const double clamped = std::clamp(normalized, 0.0, 1.0);
    return static_cast<std::uint8_t>(std::lround(clamped * 255.0));
}

} // namespace cbct
