#include "dicom.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <fstream>
#include <limits>
#include <map>
#include <numeric>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <unordered_map>

namespace cbct::dicom {
namespace {

constexpr std::uint32_t UNDEFINED_LENGTH = 0xFFFFFFFFu;

struct ElementHeader {
    std::uint16_t group{};
    std::uint16_t element{};
    std::string vr;
    std::uint32_t length{};
};

struct ParsedImage {
    std::filesystem::path path;
    std::string transfer_syntax;
    std::string series_uid;
    std::string patient_name;
    std::string patient_id;
    std::string study_date;
    std::string series_description;
    std::string modality;
    std::string photometric{"MONOCHROME2"};
    std::size_t rows{};
    std::size_t cols{};
    std::size_t frames{1};
    int bits_allocated{16};
    int bits_stored{16};
    int pixel_representation{0};
    int samples_per_pixel{1};
    int instance_number{0};
    double slope{1.0};
    double intercept{0.0};
    double window_width{0.0};
    double window_level{0.0};
    double spacing_x{1.0};
    double spacing_y{1.0};
    double spacing_between{0.0};
    double slice_thickness{1.0};
    bool has_position{false};
    std::array<double,3> position{};
    bool has_orientation{false};
    std::array<double,6> orientation{};
    std::vector<std::int16_t> pixels;
};

static std::uint16_t read_u16(std::istream& in) {
    unsigned char b[2];
    if (!in.read(reinterpret_cast<char*>(b), 2)) throw std::runtime_error("Unexpected end of DICOM file");
    return static_cast<std::uint16_t>(b[0] | (static_cast<std::uint16_t>(b[1]) << 8));
}

static std::uint32_t read_u32(std::istream& in) {
    unsigned char b[4];
    if (!in.read(reinterpret_cast<char*>(b), 4)) throw std::runtime_error("Unexpected end of DICOM file");
    return static_cast<std::uint32_t>(b[0]) |
           (static_cast<std::uint32_t>(b[1]) << 8) |
           (static_cast<std::uint32_t>(b[2]) << 16) |
           (static_cast<std::uint32_t>(b[3]) << 24);
}

static bool long_vr(const std::string& vr) {
    return vr == "OB" || vr == "OD" || vr == "OF" || vr == "OL" || vr == "OV" ||
           vr == "OW" || vr == "SQ" || vr == "UC" || vr == "UR" || vr == "UT" ||
           vr == "UN" || vr == "SV" || vr == "UV";
}

static bool looks_like_vr(char a, char b) {
    static const char* known[] = {"AE","AS","AT","CS","DA","DS","DT","FD","FL","IS","LO","LT","OB","OD","OF","OL","OV","OW","PN","SH","SL","SQ","SS","ST","SV","TM","UC","UI","UL","UN","UR","US","UT","UV"};
    char v[3]{a,b,0};
    for (auto* k : known) if (std::strcmp(v, k) == 0) return true;
    return false;
}

static ElementHeader read_header(std::istream& in, bool explicit_vr) {
    ElementHeader h;
    h.group = read_u16(in);
    h.element = read_u16(in);
    if (h.group == 0xFFFE) {
        h.length = read_u32(in);
        return h;
    }
    if (explicit_vr) {
        char vrbuf[2];
        if (!in.read(vrbuf, 2)) throw std::runtime_error("Truncated DICOM VR");
        h.vr.assign(vrbuf, 2);
        if (long_vr(h.vr)) {
            (void)read_u16(in); // reserved
            h.length = read_u32(in);
        } else {
            h.length = read_u16(in);
        }
    } else {
        h.length = read_u32(in);
    }
    return h;
}

static std::string trim_value(std::string s) {
    while (!s.empty() && (s.back() == '\0' || s.back() == ' ' || s.back() == '\r' || s.back() == '\n')) s.pop_back();
    while (!s.empty() && s.front() == ' ') s.erase(s.begin());
    return s;
}

static std::string read_string(std::istream& in, std::uint32_t length) {
    if (length == UNDEFINED_LENGTH || length > (1u << 24)) throw std::runtime_error("Invalid DICOM text value length");
    std::string s(length, '\0');
    if (length && !in.read(s.data(), length)) throw std::runtime_error("Truncated DICOM value");
    return trim_value(std::move(s));
}

static std::vector<double> parse_ds_list(const std::string& text) {
    std::vector<double> out;
    std::stringstream ss(text);
    std::string token;
    while (std::getline(ss, token, '\\')) {
        try { out.push_back(std::stod(token)); } catch (...) {}
    }
    return out;
}

static int parse_int(const std::string& s, int fallback = 0) {
    try { return std::stoi(s); } catch (...) { return fallback; }
}

static double parse_double(const std::string& s, double fallback = 0.0) {
    auto first = s.substr(0, s.find('\\'));
    try { return std::stod(first); } catch (...) { return fallback; }
}

static void skip_value(std::istream& in, const ElementHeader& h, bool explicit_vr);

static void skip_undefined_item(std::istream& in, bool explicit_vr) {
    while (in) {
        auto h = read_header(in, explicit_vr);
        if (h.group == 0xFFFE && h.element == 0xE00D) return; // Item Delimitation
        if (h.group == 0xFFFE && h.element == 0xE0DD) return; // Sequence Delimitation (tolerate malformed)
        skip_value(in, h, explicit_vr);
    }
}

static void skip_undefined_sequence(std::istream& in, bool explicit_vr) {
    while (in) {
        auto h = read_header(in, explicit_vr);
        if (h.group == 0xFFFE && h.element == 0xE0DD) return;
        if (h.group == 0xFFFE && h.element == 0xE000) {
            if (h.length == UNDEFINED_LENGTH) skip_undefined_item(in, explicit_vr);
            else in.seekg(static_cast<std::streamoff>(h.length), std::ios::cur);
        } else {
            skip_value(in, h, explicit_vr);
        }
    }
}

static void skip_value(std::istream& in, const ElementHeader& h, bool explicit_vr) {
    if (h.length == UNDEFINED_LENGTH) {
        skip_undefined_sequence(in, explicit_vr);
    } else {
        in.seekg(static_cast<std::streamoff>(h.length), std::ios::cur);
    }
}

static std::uint16_t read_us_value(std::istream& in, const ElementHeader& h) {
    if (h.length < 2) { skip_value(in, h, true); return 0; }
    auto v = read_u16(in);
    if (h.length > 2) in.seekg(static_cast<std::streamoff>(h.length - 2), std::ios::cur);
    return v;
}

static bool parse_meta_and_position(std::ifstream& in, bool& explicit_vr, std::string& transfer_syntax) {
    std::array<char,132> preamble{};
    in.read(preamble.data(), preamble.size());
    bool has_magic = in.gcount() == 132 && std::memcmp(preamble.data() + 128, "DICM", 4) == 0;
    if (!has_magic) {
        in.clear();
        in.seekg(0);
        char probe[8]{};
        in.read(probe, 8);
        if (in.gcount() < 8) return false;
        explicit_vr = looks_like_vr(probe[4], probe[5]);
        in.clear();
        in.seekg(0);
        transfer_syntax = explicit_vr ? "1.2.840.10008.1.2.1" : "1.2.840.10008.1.2";
        return true;
    }

    explicit_vr = true;
    while (in) {
        auto pos = in.tellg();
        auto h = read_header(in, true);
        if (h.group != 0x0002) {
            in.clear();
            in.seekg(pos);
            break;
        }
        if (h.group == 0x0002 && h.element == 0x0010) transfer_syntax = read_string(in, h.length);
        else skip_value(in, h, true);
    }
    if (transfer_syntax.empty()) transfer_syntax = "1.2.840.10008.1.2.1";
    if (transfer_syntax == "1.2.840.10008.1.2") explicit_vr = false;
    else if (transfer_syntax == "1.2.840.10008.1.2.1") explicit_vr = true;
    else throw std::runtime_error("Unsupported DICOM transfer syntax: " + transfer_syntax);
    return true;
}

static ParsedImage parse_image(const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("Cannot open DICOM file");

    ParsedImage out;
    out.path = path;
    bool explicit_vr = true;
    if (!parse_meta_and_position(in, explicit_vr, out.transfer_syntax)) throw std::runtime_error("Not a DICOM file");

    std::vector<unsigned char> pixel_bytes;
    while (in) {
        ElementHeader h;
        try { h = read_header(in, explicit_vr); } catch (...) { break; }
        const auto tag = (static_cast<std::uint32_t>(h.group) << 16) | h.element;

        switch (tag) {
            case 0x00100010: out.patient_name = read_string(in, h.length); break;
            case 0x00100020: out.patient_id = read_string(in, h.length); break;
            case 0x00080020: out.study_date = read_string(in, h.length); break;
            case 0x00080060: out.modality = read_string(in, h.length); break;
            case 0x0008103E: out.series_description = read_string(in, h.length); break;
            case 0x0020000E: out.series_uid = read_string(in, h.length); break;
            case 0x00200013: out.instance_number = parse_int(read_string(in, h.length)); break;
            case 0x00200032: {
                auto v = parse_ds_list(read_string(in, h.length));
                if (v.size() >= 3) { out.has_position = true; std::copy_n(v.begin(), 3, out.position.begin()); }
                break;
            }
            case 0x00200037: {
                auto v = parse_ds_list(read_string(in, h.length));
                if (v.size() >= 6) { out.has_orientation = true; std::copy_n(v.begin(), 6, out.orientation.begin()); }
                break;
            }
            case 0x00280002: out.samples_per_pixel = read_us_value(in, h); break;
            case 0x00280004: out.photometric = read_string(in, h.length); break;
            case 0x00280008: out.frames = static_cast<std::size_t>(std::max(1, parse_int(read_string(in, h.length), 1))); break;
            case 0x00280010: out.rows = read_us_value(in, h); break;
            case 0x00280011: out.cols = read_us_value(in, h); break;
            case 0x00280100: out.bits_allocated = read_us_value(in, h); break;
            case 0x00280101: out.bits_stored = read_us_value(in, h); break;
            case 0x00280103: out.pixel_representation = read_us_value(in, h); break;
            case 0x00280030: {
                auto v = parse_ds_list(read_string(in, h.length));
                if (v.size() >= 2) { out.spacing_y = v[0] > 0 ? v[0] : 1.0; out.spacing_x = v[1] > 0 ? v[1] : 1.0; }
                break;
            }
            case 0x00180050: out.slice_thickness = std::max(0.0001, parse_double(read_string(in, h.length), 1.0)); break;
            case 0x00180088: out.spacing_between = std::max(0.0, parse_double(read_string(in, h.length), 0.0)); break;
            case 0x00281052: out.intercept = parse_double(read_string(in, h.length), 0.0); break;
            case 0x00281053: out.slope = parse_double(read_string(in, h.length), 1.0); if (out.slope == 0) out.slope = 1.0; break;
            case 0x00281050: out.window_level = parse_double(read_string(in, h.length), 0.0); break;
            case 0x00281051: out.window_width = parse_double(read_string(in, h.length), 0.0); break;
            case 0x7FE00010: {
                if (h.length == UNDEFINED_LENGTH) throw std::runtime_error("Compressed/encapsulated Pixel Data is not supported in v0.2");
                if (h.length > (1u << 30)) throw std::runtime_error("Pixel Data is too large");
                pixel_bytes.resize(h.length);
                if (h.length && !in.read(reinterpret_cast<char*>(pixel_bytes.data()), h.length)) throw std::runtime_error("Truncated Pixel Data");
                break;
            }
            default: skip_value(in, h, explicit_vr); break;
        }
        if (!pixel_bytes.empty()) break;
    }

    if (out.rows == 0 || out.cols == 0 || pixel_bytes.empty()) throw std::runtime_error("DICOM image has no usable Pixel Data");
    if (out.samples_per_pixel != 1) throw std::runtime_error("Only grayscale DICOM is supported");
    if (out.bits_allocated != 8 && out.bits_allocated != 16) throw std::runtime_error("Only 8/16-bit DICOM is supported");
    if (out.photometric != "MONOCHROME1" && out.photometric != "MONOCHROME2") throw std::runtime_error("Unsupported photometric interpretation");

    const std::size_t samples = out.rows * out.cols * out.frames;
    const std::size_t bytes_per = static_cast<std::size_t>(out.bits_allocated / 8);
    if (pixel_bytes.size() < samples * bytes_per) throw std::runtime_error("Pixel Data size does not match image dimensions");
    out.pixels.resize(samples);

    for (std::size_t i = 0; i < samples; ++i) {
        double raw = 0.0;
        if (out.bits_allocated == 8) {
            if (out.pixel_representation) raw = static_cast<std::int8_t>(pixel_bytes[i]);
            else raw = pixel_bytes[i];
        } else {
            const std::uint16_t u = static_cast<std::uint16_t>(pixel_bytes[2*i]) |
                                    (static_cast<std::uint16_t>(pixel_bytes[2*i+1]) << 8);
            raw = out.pixel_representation ? static_cast<std::int16_t>(u) : static_cast<double>(u);
        }
        double value = raw * out.slope + out.intercept;
        value = std::clamp(value, -32768.0, 32767.0);
        out.pixels[i] = static_cast<std::int16_t>(std::lround(value));
    }
    return out;
}

static std::array<double,3> normal_from(const ParsedImage& img) {
    if (!img.has_orientation) return {0,0,1};
    const auto& o = img.orientation;
    return {
        o[1]*o[5] - o[2]*o[4],
        o[2]*o[3] - o[0]*o[5],
        o[0]*o[4] - o[1]*o[3]
    };
}

static double position_scalar(const ParsedImage& img) {
    auto n = normal_from(img);
    return img.position[0]*n[0] + img.position[1]*n[1] + img.position[2]*n[2];
}

static double median(std::vector<double> v) {
    if (v.empty()) return 0.0;
    std::sort(v.begin(), v.end());
    const auto m = v.size()/2;
    return v.size()%2 ? v[m] : (v[m-1]+v[m])*0.5;
}

static std::string series_key(const ParsedImage& img) {
    std::string uid = img.series_uid.empty() ? img.path.parent_path().string() : img.series_uid;
    return uid + "|" + std::to_string(img.cols) + "x" + std::to_string(img.rows);
}

} // namespace

LoadedSeries load_largest_series(const std::filesystem::path& folder) {
    if (!std::filesystem::exists(folder) || !std::filesystem::is_directory(folder))
        throw std::runtime_error("Selected path is not a folder");

    std::unordered_map<std::string, std::vector<ParsedImage>> groups;
    std::size_t readable_files = 0;
    std::string last_error;

    for (const auto& entry : std::filesystem::recursive_directory_iterator(folder, std::filesystem::directory_options::skip_permission_denied)) {
        if (!entry.is_regular_file()) continue;
        try {
            auto img = parse_image(entry.path());
            ++readable_files;
            groups[series_key(img)].push_back(std::move(img));
        } catch (const std::exception& e) {
            last_error = e.what();
        }
    }

    if (groups.empty()) {
        std::string message = "No compatible DICOM image series found. v0.2 supports uncompressed Little Endian grayscale DICOM.";
        if (!last_error.empty()) message += " Last parser message: " + last_error;
        throw std::runtime_error(message);
    }

    auto best = groups.begin();
    std::size_t best_frames = 0;
    for (auto it = groups.begin(); it != groups.end(); ++it) {
        std::size_t frames = 0;
        for (const auto& img : it->second) frames += img.frames;
        if (frames > best_frames) { best_frames = frames; best = it; }
    }
    auto images = std::move(best->second);
    const auto rows = images.front().rows;
    const auto cols = images.front().cols;

    bool sortable_by_position = images.size() > 1 && std::all_of(images.begin(), images.end(), [](const ParsedImage& i){ return i.has_position; });
    if (sortable_by_position) {
        std::sort(images.begin(), images.end(), [](const ParsedImage& a, const ParsedImage& b){ return position_scalar(a) < position_scalar(b); });
    } else {
        std::stable_sort(images.begin(), images.end(), [](const ParsedImage& a, const ParsedImage& b){ return a.instance_number < b.instance_number; });
    }

    std::vector<double> deltas;
    if (sortable_by_position) {
        for (std::size_t i=1; i<images.size(); ++i) {
            double d = std::abs(position_scalar(images[i]) - position_scalar(images[i-1]));
            if (d > 1e-5) deltas.push_back(d);
        }
    }
    double spacing_z = median(deltas);
    if (spacing_z <= 0) spacing_z = images.front().spacing_between > 0 ? images.front().spacing_between : images.front().slice_thickness;
    if (spacing_z <= 0) spacing_z = 1.0;

    std::vector<std::int16_t> volume_pixels;
    volume_pixels.reserve(cols * rows * best_frames);
    for (auto& img : images) {
        if (img.rows != rows || img.cols != cols) continue;
        volume_pixels.insert(volume_pixels.end(), img.pixels.begin(), img.pixels.end());
    }
    const std::size_t depth = volume_pixels.size() / (cols * rows);
    if (depth == 0) throw std::runtime_error("DICOM series contains no complete frames");

    LoadedSeries result(Volume({cols, rows, depth}, {images.front().spacing_x, images.front().spacing_y, spacing_z}, std::move(volume_pixels)));
    const auto& first = images.front();
    result.patient_name = first.patient_name;
    result.patient_id = first.patient_id;
    result.study_date = first.study_date;
    result.series_description = first.series_description.empty() ? "DICOM series" : first.series_description;
    result.modality = first.modality.empty() ? "CT" : first.modality;
    result.series_uid = first.series_uid;
    result.window_width = first.window_width > 1 ? first.window_width : 2500.0;
    result.window_level = first.window_width > 1 ? first.window_level : 500.0;
    result.detected_series_count = groups.size();
    return result;
}

} // namespace cbct::dicom
