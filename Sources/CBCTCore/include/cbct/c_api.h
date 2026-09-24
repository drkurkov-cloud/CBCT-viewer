#pragma once
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct cbct_volume cbct_volume;

// Plane: 0 axial, 1 coronal, 2 sagittal.
cbct_volume* cbct_volume_create(
    size_t width, size_t height, size_t depth,
    double spacing_x, double spacing_y, double spacing_z,
    const int16_t* voxels, size_t voxel_count);

// Loads the largest compatible image series found recursively in folder_path.
// v0.2 supports uncompressed little-endian grayscale DICOM (implicit/explicit VR).
cbct_volume* cbct_dicom_load_folder(const char* folder_path, char* error, size_t error_capacity);

// Built-in synthetic dataset for testing the app without patient data.
cbct_volume* cbct_create_demo_volume(void);

void cbct_volume_destroy(cbct_volume* volume);

int cbct_extract_slice_u8_i(
    const cbct_volume* volume,
    int plane,
    size_t index,
    double window_width,
    double window_level,
    uint8_t* out_pixels,
    size_t out_capacity,
    size_t* out_width,
    size_t* out_height);

double cbct_distance_mm(
    double ax, double ay, double az,
    double bx, double by, double bz,
    double spacing_x, double spacing_y, double spacing_z);

size_t cbct_volume_width(const cbct_volume* volume);
size_t cbct_volume_height(const cbct_volume* volume);
size_t cbct_volume_depth(const cbct_volume* volume);
double cbct_volume_spacing_x(const cbct_volume* volume);
double cbct_volume_spacing_y(const cbct_volume* volume);
double cbct_volume_spacing_z(const cbct_volume* volume);
double cbct_volume_default_window_width(const cbct_volume* volume);
double cbct_volume_default_window_level(const cbct_volume* volume);
size_t cbct_volume_detected_series_count(const cbct_volume* volume);

const char* cbct_volume_patient_name(const cbct_volume* volume);
const char* cbct_volume_patient_id(const cbct_volume* volume);
const char* cbct_volume_study_date(const cbct_volume* volume);
const char* cbct_volume_series_description(const cbct_volume* volume);
const char* cbct_volume_modality(const cbct_volume* volume);
const char* cbct_volume_series_uid(const cbct_volume* volume);

#ifdef __cplusplus
}
#endif
