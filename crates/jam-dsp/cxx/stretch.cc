#include "stretch.h"

namespace jam {
// Signalsmith accepts any buffer[channel][frame] view. No deinterleave copy.
template<class T> struct Stereo {
    T *data;
    struct Channel {
        T *data;
        T &operator[](int frame) const { return data[frame * 2]; }
    };
    Channel operator[](int channel) const { return {data + channel}; }
};
Stretch::Stretch(double speed, double semitones) : speed(speed) {
    dsp.presetDefault(2, 48000);
    set_parameters(speed, semitones);
}
void Stretch::set_parameters(double next_speed, double semitones) noexcept {
    speed = next_speed;
    dsp.setTransposeSemitones(static_cast<float>(semitones));
}
std::size_t Stretch::seek_length() const { return dsp.outputSeekLength(speed); }
void Stretch::seek(rust::Slice<const float> input) {
    dsp.outputSeek(Stereo<const float>{input.data()}, static_cast<int>(input.size() / 2));
}
void Stretch::process(rust::Slice<const float> input, rust::Slice<float> output) {
    dsp.process(Stereo<const float>{input.data()}, static_cast<int>(input.size() / 2),
                Stereo<float>{output.data()}, static_cast<int>(output.size() / 2));
}
std::unique_ptr<Stretch> new_stretch(double speed, double semitones) {
    return std::make_unique<Stretch>(speed, semitones);
}
}
