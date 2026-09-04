# Josefines Jamstudio

## Purpose

Help Vegar's guitarist friend write and record original music. Capture an idea,
develop it with a band, arrange sections, record guitar layers, and continue in Logic.
The user confirmed this priority and asked for everything to be easy to tweak in the simplest way possible.

## Platform and stack

Existing Tauri desktop application, Rust audio/MIDI, React and TypeScript controls.
Mac with the friend's hardware is the intended playing environment; Windows is also built and tested.

## Product constraints

Preserve hardware guitar monitoring, local audio files, OS-keychain secrets,
the existing chart/style formats and the dark stage design in docs/DESIGN.md.
Use ordinary controls, explicit saves, undo and named musical alternatives.
The guitarist chooses what sounds good. Hardware sound, timing and Logic import require owner verification.

## Current scope

The Write surface supports 4/4 songwriting, manual chord/tempo correction,
short guitar clips at their recorded pitch/speed, and a small editable rhythm section.
Sound selection remains the existing synthesis engine; premium sample libraries,
automatic riff transcription, pitch-preserving stretch and final production are separate work.
