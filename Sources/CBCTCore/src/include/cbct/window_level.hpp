#pragma once
#include <cstdint>

namespace cbct {

struct WindowLevel {
    double width{2500.0};
    double level{500.0};
};

[[nodiscard]] std::uint8_t apply_window_level(std::int16_t value, WindowLevel wl) noexcept;

} // namespace cbct
