#include "cbct/mpr.hpp"
#include <stdexcept>

namespace cbct {

Image8 extract_orthogonal_slice(const Volume& v, Plane plane, std::size_t index, WindowLevel wl) {
    const auto d = v.dims();
    Image8 img;

    switch (plane) {
        case Plane::Axial:
            if (index >= d.depth) throw std::out_of_range("Axial slice index out of range");
            img.width = d.width;
            img.height = d.height;
            img.pixels.resize(img.width * img.height);
            for (std::size_t y = 0; y < d.height; ++y)
                for (std::size_t x = 0; x < d.width; ++x)
                    img.pixels[y * img.width + x] = apply_window_level(v.at(x, y, index), wl);
            break;

        case Plane::Coronal:
            if (index >= d.height) throw std::out_of_range("Coronal slice index out of range");
            img.width = d.width;
            img.height = d.depth;
            img.pixels.resize(img.width * img.height);
            for (std::size_t z = 0; z < d.depth; ++z)
                for (std::size_t x = 0; x < d.width; ++x)
                    img.pixels[z * img.width + x] = apply_window_level(v.at(x, index, z), wl);
            break;

        case Plane::Sagittal:
            if (index >= d.width) throw std::out_of_range("Sagittal slice index out of range");
            img.width = d.height;
            img.height = d.depth;
            img.pixels.resize(img.width * img.height);
            for (std::size_t z = 0; z < d.depth; ++z)
                for (std::size_t y = 0; y < d.height; ++y)
                    img.pixels[z * img.width + y] = apply_window_level(v.at(index, y, z), wl);
            break;
    }
    return img;
}

} // namespace cbct
