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
    /// m7b5 / ø: minor third, flat five, minor seventh.
    HalfDiminished,
    Power5,
    Sus4,
}

/// Chart tokens that mean "no chord": keep drums, skip bass and comp.
/// Same set as `isRestSymbol` in `src/lib/chart/text.ts` (`n.?c.?`, `rest`, `-`).
pub fn is_rest_symbol(symbol: &str) -> bool {
    let s = symbol.trim();
    if s == "-" {
        return true;
    }
    matches!(
        s.to_ascii_lowercase().as_str(),
        "rest" | "nc" | "n.c" | "nc." | "n.c."
    )
}

/// Parses a chord symbol (e.g. "A7", "D7", "Em", "Cmaj7", "G", "F#m7")
/// into root semitone (0 = C, 1 = C#, ... 11 = B) and ChordQuality.
/// Rests (`N.C.`, `NC`, `rest`, `-`) and empty symbols return `None`.
pub fn parse_chord(symbol: &str) -> Option<(i32, ChordQuality)> {
    let s = symbol.trim();
    if s.is_empty() || is_rest_symbol(s) {
        return None;
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

    let mut quality_str = &s[root_char.len_utf8()..];
    while let Some(accidental) = quality_str.chars().next() {
        let delta = match accidental {
            '#' => 1,
            'b' => -1,
            'x' => 2,
            _ => break,
        };
        root = (root + delta + 12) % 12;
        quality_str = &quality_str[accidental.len_utf8()..];
    }

    // Slash chords ("C/G") keep the upper structure; written bass is `slash_bass`.
    let quality_str = quality_str.split('/').next().unwrap_or("");
    let quality = classify_quality(quality_str);

    Some((root, quality))
}

/// Pitch class written after `/` (`C/E` → 4). Same letters and accidentals as the root.
pub fn slash_bass(symbol: &str) -> Option<i32> {
    let after = symbol.trim().split_once('/')?.1.trim();
    parse_note_pc(after)
}

fn parse_note_pc(s: &str) -> Option<i32> {
    let s = s.trim();
    let letter = s.chars().next()?.to_ascii_uppercase();
    let mut pc = match letter {
        'C' => 0,
        'D' => 2,
        'E' => 4,
        'F' => 5,
        'G' => 7,
        'A' => 9,
        'B' => 11,
        _ => return None,
    };
    let mut rest = &s[letter.len_utf8()..];
    while let Some(accidental) = rest.chars().next() {
        let delta = match accidental {
            '#' => 1,
            'b' => -1,
            'x' => 2,
            _ => break,
        };
        pc = (pc + delta + 12) % 12;
        rest = &rest[accidental.len_utf8()..];
    }
    if !rest.is_empty() {
        return None;
    }
    Some(pc)
}

/// Maps a chord-symbol suffix onto the closest quality the band can voice. Extensions
/// (9, 11, 13, alterations) fold onto their seventh-chord family so "A7#9" grooves like
/// "A7" and "Dm9" like "Dm7".
fn classify_quality(suffix: &str) -> ChordQuality {
    let q = suffix.trim();
    if q.is_empty() {
        return ChordQuality::Major;
    }
    let has_seventh_ext =
        |s: &str| s.contains('7') || s.contains('9') || s.contains("11") || s.contains("13");

    if q.starts_with("m7b5") || q.starts_with('ø') || q.starts_with("min7b5") {
        return ChordQuality::HalfDiminished;
    }
    if q.starts_with("dim") || q.starts_with('o') || q.starts_with('°') {
        return ChordQuality::Diminished;
    }
    if q.starts_with("maj") || q.starts_with('Δ') || q.starts_with('M') {
        let ext = q
            .trim_start_matches("maj")
            .trim_start_matches('Δ')
            .trim_start_matches('M');
        return if has_seventh_ext(ext) {
            ChordQuality::Major7
        } else {
            ChordQuality::Major
        };
    }
    if q.starts_with("min") || q.starts_with('m') || q.starts_with('-') {
        let ext = q
            .trim_start_matches("min")
            .trim_start_matches('m')
            .trim_start_matches('-');
        // "mMaj7" is rare enough to voice as plain minor.
        return if has_seventh_ext(ext) && !ext.starts_with("Maj") && !ext.starts_with("maj") {
            ChordQuality::Minor7
        } else {
            ChordQuality::Minor
        };
    }
    if q.starts_with("sus") {
        return ChordQuality::Sus4;
    }
    if q == "5" || q.starts_with("power") {
        return ChordQuality::Power5;
    }
    if q.starts_with("dom")
        || q.starts_with('7')
        || q.starts_with('9')
        || q.starts_with("11")
        || q.starts_with("13")
    {
        return ChordQuality::Dominant7;
    }
    // "6", "add9", "aug", "+" and anything else: a major-family chord.
    ChordQuality::Major
}

/// Computes a comping voicing as a list of MIDI note numbers constrained to C3 (48) .. C6 (84).
pub fn voice_chord(chord_symbol: &str, voicing_kind: &str) -> Vec<u8> {
    let Some((root, quality)) = parse_chord(chord_symbol) else {
        return Vec::new();
    };

    let intervals: &[i32] = match (voicing_kind, quality) {
        ("shell", ChordQuality::Dominant7) => &[0, 4, 10], // Root, 3, b7
        ("shell", ChordQuality::Major7) => &[0, 4, 11],    // Root, 3, 7
        ("shell", ChordQuality::Minor7) => &[0, 3, 10],    // Root, b3, b7
        ("shell", ChordQuality::Minor) => &[0, 3, 7],
        ("shell", ChordQuality::Major) => &[0, 4, 7],
        ("shell", ChordQuality::HalfDiminished) => &[0, 3, 10], // b5 left to the bass
        ("shell", ChordQuality::Diminished) => &[0, 3, 6],
        ("shell", ChordQuality::Sus4) => &[0, 5, 7],
        ("power", _) => &[0, 7, 12], // Root, 5, 8ve
        ("triad", ChordQuality::Minor) | ("triad", ChordQuality::Minor7) => &[0, 3, 7],
        ("triad", ChordQuality::Diminished) | ("triad", ChordQuality::HalfDiminished) => &[0, 3, 6],
        ("triad", ChordQuality::Sus4) => &[0, 5, 7],
        ("triad", _) => &[0, 4, 7],
        ("drop2", ChordQuality::Dominant7) => &[0, 10, 16, 19], // Root, b7, 3, 5
        ("drop2", ChordQuality::Major7) => &[0, 11, 16, 19],
        ("drop2", ChordQuality::Minor7) => &[0, 10, 15, 19],
        ("drop2", ChordQuality::HalfDiminished) => &[0, 10, 15, 18],
        ("drop2", ChordQuality::Diminished) => &[0, 9, 15, 18],
        ("drop2", ChordQuality::Major) => &[0, 7, 12, 16],
        ("drop2", ChordQuality::Minor) => &[0, 7, 12, 15],
        ("drop2", ChordQuality::Sus4) => &[0, 7, 12, 17],
        (_, ChordQuality::Major) => &[0, 4, 7],
        (_, ChordQuality::Minor) => &[0, 3, 7],
        (_, ChordQuality::Minor7) => &[0, 3, 7, 10],
        (_, ChordQuality::Major7) => &[0, 4, 7, 11],
        (_, ChordQuality::HalfDiminished) => &[0, 3, 6, 10],
        (_, ChordQuality::Diminished) => &[0, 3, 6, 9],
        (_, ChordQuality::Sus4) => &[0, 5, 7],
        (_, ChordQuality::Power5) => &[0, 7, 12],
        (_, ChordQuality::Dominant7) => &[0, 4, 7, 10],
    };

    // Place the root in the middle comp octave (C4 = 60); if the voicing pokes above
    // C6 move the whole shape down an octave so the intervals stay intact.
    let mut base_note = 60 + root;
    if let Some(top) = intervals.iter().max() {
        if base_note + top > 84 {
            base_note -= 12;
        }
    }

    let mut notes: Vec<u8> = intervals
        .iter()
        .map(|&interval| (base_note + interval).clamp(48, 84) as u8)
        .collect();

    notes.sort_unstable();
    notes.dedup();
    notes
}

/// Computes a bass note from chord root semitone, degree (1..=7), and octave.
/// Strictly constrained within E1 (28) to G3 (55). Assumes a dominant-flavoured chord.
pub fn bass_note_for_degree(root_semitone: i32, degree: i32, octave_offset: i32) -> u8 {
    bass_note_for_chord(
        root_semitone,
        ChordQuality::Dominant7,
        degree,
        octave_offset,
    )
}

/// Like [`bass_note_for_degree`] but the third, fifth and seventh follow the chord
/// quality, so a walking line over Am7 or Bdim lands on chord tones.
pub fn bass_note_for_chord(
    root_semitone: i32,
    quality: ChordQuality,
    degree: i32,
    octave_offset: i32,
) -> u8 {
    let minor_third = matches!(
        quality,
        ChordQuality::Minor
            | ChordQuality::Minor7
            | ChordQuality::Diminished
            | ChordQuality::HalfDiminished
    );
    let degree_semitones = match degree {
        1 => 0,
        2 => 2,
        3 => {
            if minor_third {
                3
            } else if quality == ChordQuality::Sus4 {
                5
            } else {
                4
            }
        }
        4 => 5,
        5 => {
            if matches!(
                quality,
                ChordQuality::Diminished | ChordQuality::HalfDiminished
            ) {
                6
            } else {
                7
            }
        }
        6 => 9,
        7 => match quality {
            ChordQuality::Major7 => 11,
            ChordQuality::Diminished => 9,
            _ => 10,
        },
        _ => 0,
    };

    // E1 is 28 (MIDI). Root in Octave 1 is 24 + root_semitone.
    let mut note = 24 + root_semitone + degree_semitones + (octave_offset * 12);
    // Fold by octaves into E1 (28) .. G3 (55) so the pitch class is preserved.
    while note < 28 {
        note += 12;
    }
    while note > 55 {
        note -= 12;
    }
    note as u8
}

#[cfg(test)]
mod tests {
    #[test]
    fn double_accidentals_preserve_pitch_and_quality() {
        assert_eq!(
            super::parse_chord("F##dim"),
            Some((7, super::ChordQuality::Diminished))
        );
        assert_eq!(
            super::parse_chord("Bbbm7"),
            Some((9, super::ChordQuality::Minor7))
        );
        assert_eq!(
            super::parse_chord("Cxm"),
            Some((2, super::ChordQuality::Minor))
        );
    }

    use super::*;

    #[test]
    fn test_chord_parsing() {
        assert_eq!(parse_chord("A7"), Some((9, ChordQuality::Dominant7)));
        assert_eq!(parse_chord("D7"), Some((2, ChordQuality::Dominant7)));
        assert_eq!(parse_chord("E7"), Some((4, ChordQuality::Dominant7)));
        assert_eq!(parse_chord("Am"), Some((9, ChordQuality::Minor)));
        assert_eq!(parse_chord("Cmaj7"), Some((0, ChordQuality::Major7)));
        assert_eq!(parse_chord("F#m7"), Some((6, ChordQuality::Minor7)));
        assert_eq!(parse_chord("Bb7"), Some((10, ChordQuality::Dominant7)));
    }

    #[test]
    fn rest_tokens_are_not_c_major() {
        for symbol in ["N.C.", "N.C", "NC", "NC.", "n.c.", "rest", "REST", "-", ""] {
            assert_eq!(parse_chord(symbol), None, "{symbol}");
            assert!(voice_chord(symbol, "shell").is_empty(), "{symbol}");
        }
        assert!(parse_chord("A7").is_some());
        assert!(!is_rest_symbol("Am"));
        assert!(!is_rest_symbol("C"));
    }

    #[test]
    fn extended_and_slash_chords_fold_onto_their_family() {
        assert_eq!(parse_chord("A9"), Some((9, ChordQuality::Dominant7)));
        assert_eq!(parse_chord("A7#9"), Some((9, ChordQuality::Dominant7)));
        assert_eq!(parse_chord("E13"), Some((4, ChordQuality::Dominant7)));
        assert_eq!(parse_chord("Dm9"), Some((2, ChordQuality::Minor7)));
        assert_eq!(parse_chord("Dm6"), Some((2, ChordQuality::Minor)));
        assert_eq!(parse_chord("Cmaj9"), Some((0, ChordQuality::Major7)));
        assert_eq!(parse_chord("C6"), Some((0, ChordQuality::Major)));
        assert_eq!(parse_chord("Cadd9"), Some((0, ChordQuality::Major)));
        assert_eq!(
            parse_chord("Bm7b5"),
            Some((11, ChordQuality::HalfDiminished))
        );
        assert_eq!(parse_chord("Bø"), Some((11, ChordQuality::HalfDiminished)));
        assert_eq!(parse_chord("G#dim7"), Some((8, ChordQuality::Diminished)));
        assert_eq!(parse_chord("C/G"), Some((0, ChordQuality::Major)));
        assert_eq!(parse_chord("D7/F#"), Some((2, ChordQuality::Dominant7)));
        assert_eq!(slash_bass("C/E"), Some(4));
        assert_eq!(slash_bass("D7/F#"), Some(6));
        assert_eq!(slash_bass("C"), None);
        assert_eq!(voice_chord("C/E", "shell"), voice_chord("C", "shell"));
        assert_eq!(parse_chord("Esus"), Some((4, ChordQuality::Sus4)));
        assert_eq!(parse_chord("E5"), Some((4, ChordQuality::Power5)));
    }

    #[test]
    fn voicings_keep_their_intervals_instead_of_clamping() {
        // B drop2 dominant would exceed C6 from the C4 octave; it must move down whole.
        let notes = voice_chord("B7", "drop2");
        let root = notes[0] as i32;
        let rel: Vec<i32> = notes.iter().map(|&n| n as i32 - root).collect();
        assert_eq!(rel, vec![0, 10, 16, 19]);
        assert!(notes.iter().all(|&n| (48..=84).contains(&n)));
        // A plain major chord has no seventh in it.
        let c = voice_chord("C", "shell");
        assert_eq!(c, vec![60, 64, 67]);
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
    fn bass_third_follows_chord_quality() {
        let a = 9;
        let major_third = bass_note_for_chord(a, ChordQuality::Dominant7, 3, 0);
        let minor_third = bass_note_for_chord(a, ChordQuality::Minor7, 3, 0);
        assert_eq!(major_third - minor_third, 1);
        let maj7 = bass_note_for_chord(a, ChordQuality::Major7, 7, 0);
        let dom7 = bass_note_for_chord(a, ChordQuality::Dominant7, 7, 0);
        assert_eq!(maj7 - dom7, 1);
    }

    #[test]
    fn bass_root_keeps_pitch_class_when_folded_into_range() {
        for root in 0..12 {
            let n = bass_note_for_chord(root, ChordQuality::Major, 1, 0) as i32;
            assert_eq!(n % 12, root % 12, "root {root} lost its pitch class");
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
