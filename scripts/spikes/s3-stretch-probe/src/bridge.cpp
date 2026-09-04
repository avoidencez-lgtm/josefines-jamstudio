#include "bridge.h"
#include <cmath>
#include <vector>
#define _USE_MATH_DEFINES
#include <math.h>
#include "signalsmith-stretch/signalsmith-stretch.h"

struct StretchImpl {
    signalsmith::stretch::SignalsmithStretch<float> stretch;
};

StretchWrapper::StretchWrapper() {
    auto* p = new StretchImpl();
    p->stretch.presetDefault(1, 48000.0f);
    impl = p;
}

StretchWrapper::~StretchWrapper() {
    delete static_cast<StretchImpl*>(impl);
}

float StretchWrapper::test_sine_stretch(float freq_hz, float stretch_ratio, float sample_rate, float duration_sec) {
    auto* p = static_cast<StretchImpl*>(impl);
    p->stretch.presetDefault(1, sample_rate);

    int in_samples = static_cast<int>(duration_sec * sample_rate);
    std::vector<float> input(in_samples);
    for (int i = 0; i < in_samples; ++i) {
        input[i] = std::sin(2.0f * (float)M_PI * freq_hz * (float)i / sample_rate);
    }

    int out_samples = static_cast<int>(in_samples * stretch_ratio);
    std::vector<float> output(out_samples);

    float* in_ptr = input.data();
    float* out_ptr = output.data();
    p->stretch.process(&in_ptr, in_samples, &out_ptr, out_samples);

    // Estimate output frequency via zero crossings in steady state (skip first 2048 samples)
    int start = 2048;
    int end = out_samples - 2048;
    int zero_crossings = 0;
    for (int i = start; i < end - 1; ++i) {
        if ((output[i] <= 0.0f && output[i + 1] > 0.0f) || (output[i] >= 0.0f && output[i + 1] < 0.0f)) {
            zero_crossings++;
        }
    }
    float analyzed_sec = (float)(end - start) / sample_rate;
    return (float)zero_crossings / (2.0f * analyzed_sec);
}

std::unique_ptr<StretchWrapper> new_stretch() {
    return std::make_unique<StretchWrapper>();
}
