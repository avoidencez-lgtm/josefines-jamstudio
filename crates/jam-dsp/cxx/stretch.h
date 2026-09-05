#pragma once
#include "rust/cxx.h"
#include "vendor/signalsmith-stretch.h"
#include <memory>

namespace jam {
class Stretch {
    signalsmith::stretch::SignalsmithStretch<float> dsp{0};
    double speed;
public:
    Stretch(double speed, double semitones);
    std::size_t seek_length() const;
    void seek(rust::Slice<const float> input);
    void process(rust::Slice<const float> input, rust::Slice<float> output);
};
std::unique_ptr<Stretch> new_stretch(double speed, double semitones);
}
