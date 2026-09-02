#pragma once
#include <memory>

class StretchWrapper {
    void* impl;
public:
    StretchWrapper();
    ~StretchWrapper();
    float test_sine_stretch(float freq_hz, float stretch_ratio, float sample_rate, float duration_sec);
};

std::unique_ptr<StretchWrapper> new_stretch();
