//! voicing: Chord parsing and guitar/piano voicing templates.
//! Enforces range constraints: Bass (E1=28 to G3=55), Comp (C3=48 to C6=84).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChordQuality {
    Major,
    Minor,
    Dominant7,
    Major7,
    Minor7,
    Diminished,
    Power5,
    Sus4,
}

/// Parses a chord symbol (e.g. "A7", "D7", "Em", "Cmaj7", "G", "F#m7")
/// into root semitone (0 = C, 1 = C#, ... 11 = B) and ChordQuality.
pub fn parse_chord(symbol: &str) -> (i32, ChordQuality) {
    let s = symbol.trim();
    if s.is_empty() {
        return (0, ChordQuality::Major);
    }

    let mut chars = s.chars();
    let root_char = chars.next().unwrap().to_ascii_uppercase();
    let mut root = match root_char {
        'C' => 0,
        'D' => 2,
        'E' => 4,
        'F' => 5,
        'G' => 7,
        'A' => 9,
        'B' => 11,
        _ => 0,
    };

    let rest = &s[1..];
    let (accidental, quality_str) = if let Some(stripped) = rest.strip_prefix('#') {
        root = (root + 1) % 12;
        ('#', stripped)
    } else if let Some(stripped) = rest.strip_prefix('b') {
        root = (root + 11) % 12;
        ('b', stripped)
    } else {
        (' ', rest)
    };
    let _ = accidental;

    let quality = match quality_str {
        "m" | "min" | "-" => ChordQuality::Minor,
        "7" | "dom7" => ChordQuality::Dominant7,
        "maj7" | "M7" | "Δ" => ChordQuality::Major7,
        "m7" | "min7" | "-7" => ChordQuality::Minor7,
        "dim" | "dim7" | "o" => ChordQuality::Diminished,
        "5" | "power" => ChordQuality::Power5,
        "sus4" | "sus" => ChordQuality::Sus4,
        _ => ChordQuality::Major,
    };

    (root, quality)
}

/// Computes a comping voicing as a list of MIDI note numbers constrained to C3 (48) .. C6 (84).
pub fn voice_chord(chord_symbol: &str, voicing_kind: &str) -> Vec<u8> {
    let (root, quality) = parse_chord(chord_symbol);

    let intervals: &[i32] = match (voicing_kind, quality) {
        ("shell", ChordQuality::Dominant7) => &[0, 4, 10], // Root, 3, b7
        ("shell", ChordQuality::Major7) => &[0, 4, 11],    // Root, 3, 7
        ("shell", ChordQuality::Minor7) => &[0, 3, 10],    // Root, b3, b7
        ("shell", ChordQuality::Minor) => &[0, 3, 7],
        ("power", _) => &[0, 7, 12], // Root, 5, 8ve
        ("triad", ChordQuality::Minor) => &[0, 3, 7],
        ("triad", ChordQuality::Diminished) => &[0, 3, 6],
        ("triad", ChordQuality::Sus4) => &[0, 5, 7],
        ("triad", _) => &[0, 4, 7],
        ("drop2", ChordQuality::Dominant7) => &[0, 10, 16, 19], // Root, b7, 3, 5
        ("drop2", ChordQuality::Major7) => &[0, 11, 16, 19],
        ("drop2", ChordQuality::Minor7) => &[0, 10, 15, 19],
        _ => &[0, 4, 7, 10], // Default 7th
    };

    // Place root in the middle comp octave (C4 = 60)
    let base_note = 60 + root;

    let mut notes: Vec<u8> = intervals
        .iter()
        .map(|&interval| {
            let n = base_note + interval;
            // Clamp strictly within C3 (48) to C6 (84)
            n.clamp(48, 84) as u8
        })
        .collect();

    notes.sort_unstable();
    notes.dedup();
    notes
}

/// Computes a bass note from chord root semitone, degree (1..=7), and octave.
/// Strictly constrained within E1 (28) to G3 (55).
pub fn bass_note_for_degree(root_semitone: i32, degree: i32, octave_offset: i32) -> u8 {
    let degree_semitones = match degree {
        1 => 0,
        2 => 2,
        3 => 4,
        4 => 5,
        5 => 7,
        6 => 9,
        7 => 10, // Dominant flat 7 by default for blues/rock
        _ => 0,
    };

    // E1 is 28 (MIDI). Root in Octave 1 is 24 + root_semitone.
    let base_root = 24 + root_semitone + degree_semitones + (octave_offset * 12);
    // Clamp strictly to E1 (28) .. G3 (55)
    base_root.clamp(28, 55) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chord_parsing() {
        assert_eq!(parse_chord("A7"), (9, ChordQuality::Dominant7));
        assert_eq!(parse_chord("D7"), (2, ChordQuality::Dominant7));
        assert_eq!(parse_chord("E7"), (4, ChordQuality::Dominant7));
        assert_eq!(parse_chord("Am"), (9, ChordQuality::Minor));
        assert_eq!(parse_chord("Cmaj7"), (0, ChordQuality::Major7));
        assert_eq!(parse_chord("F#m7"), (6, ChordQuality::Minor7));
        assert_eq!(parse_chord("Bb7"), (10, ChordQuality::Dominant7));
    }

    #[test]
    fn test_comp_voicing_range_limits() {
        let chords = ["A7", "D7", "E7", "C", "G", "F#m", "B7", "Bb7"];
        let voicings = ["shell", "triad", "drop2", "power"];

        for c in chords {
            for v in voicings {
                let notes = voice_chord(c, v);
                assert!(!notes.is_empty());
                for &n in &notes {
                    assert!(
                        (48..=84).contains(&n),
                        "Note {} for chord {} voicing {} out of range C3(48)..C6(84)",
                        n,
                        c,
                        v
                    );
                }
            }
        }
    }

    #[test]
    fn test_bass_note_range_limits() {
        for root in 0..12 {
            for degree in 1..=7 {
                for oct in -1..=2 {
                    let n = bass_note_for_degree(root, degree, oct);
                    assert!(
                        (28..=55).contains(&n),
                        "Bass note {} for root {} degree {} oct {} out of range E1(28)..G3(55)",
                        n,
                        root,
                        degree,
                        oct
                    );
                }
            }
        }
    }
}
