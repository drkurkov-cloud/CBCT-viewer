#include "cbct/c_api.h"
#include "cbct/mpr.hpp"
#include "cbct/measurements.hpp"
#include "dicom.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <memory>
#include <string>
#include <utility>
#include <vector>

struct cbct_volume {
    cbct::Volume impl;
    std::string patient_name;
    std::string patient_id;
    std::string study_date;
    std::string series_description;
    std::string modality;
    std::string series_uid;
    double default_ww{2500.0};
    double default_wl{500.0};
    std::size_t detected_series_count{1};

    explicit cbct_volume(cbct::Volume&& v) : impl(std::move(v)) {}
};

static void set_error(char* error, size_t cap, const std::string& message) {
    if (!error || cap == 0) return;
    const auto n = std::min(cap - 1, message.size());
    std::memcpy(error, message.data(), n);
    error[n] = '\0';
}

cbct_volume* cbct_volume_create(
    size_t width, size_t height, size_t depth,
    double sx, double sy, double sz,
    const int16_t* voxels, size_t voxel_count) {
    if (!voxels) return nullptr;
    try {
        std::vector<int16_t> data(voxels, voxels + voxel_count);
        return new cbct_volume(cbct::Volume({width, height, depth}, {sx, sy, sz}, std::move(data)));
    } catch (...) { return nullptr; }
}

cbct_volume* cbct_dicom_load_folder(const char* folder_path, char* error, size_t error_capacity) {
    if (!folder_path) { set_error(error, error_capacity, "Folder path is empty"); return nullptr; }
    try {
        auto loaded = cbct::dicom::load_largest_series(folder_path);
        auto* out = new cbct_volume(std::move(loaded.volume));
        out->patient_name = std::move(loaded.patient_name);
        out->patient_id = std::move(loaded.patient_id);
        out->study_date = std::move(loaded.study_date);
        out->series_description = std::move(loaded.series_description);
        out->modality = std::move(loaded.modality);
        out->series_uid = std::move(loaded.series_uid);
        out->default_ww = loaded.window_width;
        out->default_wl = loaded.window_level;
        out->detected_series_count = loaded.detected_series_count;
        set_error(error, error_capacity, "");
        return out;
    } catch (const std::exception& e) {
        set_error(error, error_capacity, e.what());
        return nullptr;
    }
}

cbct_volume* cbct_create_demo_volume(void) {
    try {
        const size_t w = 192, h = 192, d = 160;
        std::vector<int16_t> vox(w*h*d, -1000);
        for (size_t z=0; z<d; ++z) for (size_t y=0; y<h; ++y) for (size_t x=0; x<w; ++x) {
            const double nx = (static_cast<double>(x) - w*0.5) / (w*0.42);
            const double ny = (static_cast<double>(y) - h*0.5) / (h*0.46);
            const double nz = (static_cast<double>(z) - d*0.5) / (d*0.48);
            const double r = nx*nx + ny*ny + nz*nz;
            int value = -1000;
            if (r < 1.0) value = 40;                         // soft tissue
            if (r > 0.70 && r < 0.88) value = 1050;        // cortical shell
            if (r >= 0.56 && r <= 0.70) value = 280;       // trabecular zone
            // bilateral sinus-like air cavities
            const double s1 = std::pow(nx+0.28,2)/0.08 + std::pow(ny+0.08,2)/0.12 + std::pow(nz-0.05,2)/0.20;
            const double s2 = std::pow(nx-0.28,2)/0.08 + std::pow(ny+0.08,2)/0.12 + std::pow(nz-0.05,2)/0.20;
            if ((s1 < 1.0 || s2 < 1.0) && r < 0.70) value = -850;
            // a row of high-density tooth-like objects
            if (nz > -0.55 && nz < -0.10 && ny > 0.05 && ny < 0.32) {
                for (int t=-4; t<=4; ++t) {
                    const double tx = t * 0.105;
                    if ((nx-tx)*(nx-tx) + (ny-0.19)*(ny-0.19) < 0.0026) value = 1900;
                }
            }
            vox[(z*h+y)*w+x] = static_cast<int16_t>(value);
        }
        auto* out = new cbct_volume(cbct::Volume({w,h,d},{0.40,0.40,0.50},std::move(vox)));
        out->patient_name = "Demo Patient";
        out->patient_id = "DEMO";
        out->study_date = "20260924";
        out->series_description = "Synthetic dental CBCT";
        out->modality = "CT";
        out->series_uid = "demo.local";
        out->default_ww = 2600;
        out->default_wl = 450;
        return out;
    } catch (...) { return nullptr; }
}

void cbct_volume_destroy(cbct_volume* volume) { delete volume; }

int cbct_extract_slice_u8_i(
    const cbct_volume* volume, int plane, size_t index, double ww, double wl,
    uint8_t* out_pixels, size_t out_capacity, size_t* out_width, size_t* out_height) {
    if (!volume || !out_width || !out_height) return -1;
    try {
        cbct::Plane p = cbct::Plane::Axial;
        if (plane == 1) p = cbct::Plane::Coronal;
        else if (plane == 2) p = cbct::Plane::Sagittal;
        const auto image = cbct::extract_orthogonal_slice(volume->impl, p, index, {ww, wl});
        *out_width = image.width; *out_height = image.height;
        if (!out_pixels || out_capacity < image.pixels.size()) return 1;
        std::copy(image.pixels.begin(), image.pixels.end(), out_pixels);
        return 0;
    } catch (...) { return -2; }
}

double cbct_distance_mm(double ax,double ay,double az,double bx,double by,double bz,double sx,double sy,double sz) {
    return cbct::distance_mm({ax,ay,az},{bx,by,bz},{sx,sy,sz});
}

size_t cbct_volume_width(const cbct_volume* v) { return v ? v->impl.dims().width : 0; }
size_t cbct_volume_height(const cbct_volume* v) { return v ? v->impl.dims().height : 0; }
size_t cbct_volume_depth(const cbct_volume* v) { return v ? v->impl.dims().depth : 0; }
double cbct_volume_spacing_x(const cbct_volume* v) { return v ? v->impl.spacing().x : 0; }
double cbct_volume_spacing_y(const cbct_volume* v) { return v ? v->impl.spacing().y : 0; }
double cbct_volume_spacing_z(const cbct_volume* v) { return v ? v->impl.spacing().z : 0; }
double cbct_volume_default_window_width(const cbct_volume* v) { return v ? v->default_ww : 2500; }
double cbct_volume_default_window_level(const cbct_volume* v) { return v ? v->default_wl : 500; }
size_t cbct_volume_detected_series_count(const cbct_volume* v) { return v ? v->detected_series_count : 0; }
const char* cbct_volume_patient_name(const cbct_volume* v) { return v ? v->patient_name.c_str() : ""; }
const char* cbct_volume_patient_id(const cbct_volume* v) { return v ? v->patient_id.c_str() : ""; }
const char* cbct_volume_study_date(const cbct_volume* v) { return v ? v->study_date.c_str() : ""; }
const char* cbct_volume_series_description(const cbct_volume* v) { return v ? v->series_description.c_str() : ""; }
const char* cbct_volume_modality(const cbct_volume* v) { return v ? v->modality.c_str() : ""; }
const char* cbct_volume_series_uid(const cbct_volume* v) { return v ? v->series_uid.c_str() : ""; }
