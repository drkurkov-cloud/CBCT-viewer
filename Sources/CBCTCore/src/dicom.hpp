#pragma once
#include "cbct/volume.hpp"
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace cbct::dicom {

struct LoadedSeries {
    Volume volume;
    std::string patient_name;
    std::string patient_id;
    std::string study_date;
    std::string series_description;
    std::string modality;
    std::string series_uid;
    double window_width{2500.0};
    double window_level{500.0};
    std::size_t detected_series_count{1};

    LoadedSeries(Volume&& v) : volume(std::move(v)) {}
};

LoadedSeries load_largest_series(const std::filesystem::path& folder);

} // namespace cbct::dicom
