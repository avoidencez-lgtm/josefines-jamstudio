//! Symphonia 0.6 decodes MP4 samples but does not apply edit lists. Read only the
//! selected track's static trim; reject edits we cannot reproduce faithfully.
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};

const ERROR: &str = "Unsupported or damaged M4A timing. Export a continuous WAV or FLAC file.";

fn u32_at(data: &[u8], at: usize) -> Result<u32, String> {
    Ok(u32::from_be_bytes(
        data.get(at..at + 4).ok_or(ERROR)?.try_into().unwrap(),
    ))
}
fn u64_at(data: &[u8], at: usize) -> Result<u64, String> {
    Ok(u64::from_be_bytes(
        data.get(at..at + 8).ok_or(ERROR)?.try_into().unwrap(),
    ))
}
fn atom<'a>(data: &mut &'a [u8]) -> Result<([u8; 4], &'a [u8]), String> {
    let size = u32_at(data, 0)?;
    let name = data.get(4..8).ok_or(ERROR)?.try_into().unwrap();
    let (size, header) = match size {
        0 => (data.len() as u64, 8),
        1 => (u64_at(data, 8)?, 16),
        size => (size as u64, 8),
    };
    let size = usize::try_from(size).map_err(|_| ERROR)?;
    let payload = data.get(header..size).ok_or(ERROR)?;
    *data = &data[size..];
    Ok((name, payload))
}
fn child<'a>(mut data: &'a [u8], name: &[u8; 4]) -> Result<Option<&'a [u8]>, String> {
    let mut found = None;
    while !data.is_empty() {
        let (kind, payload) = atom(&mut data)?;
        if &kind == name && found.replace(payload).is_some() {
            return Err(ERROR.into());
        }
    }
    Ok(found)
}
fn required<'a>(data: &'a [u8], name: &[u8; 4]) -> Result<&'a [u8], String> {
    child(data, name)?.ok_or(ERROR.into())
}
fn time_offset(data: &[u8]) -> Result<usize, String> {
    match data.first() {
        Some(0) => Ok(12),
        Some(1) => Ok(20),
        _ => Err(ERROR.into()),
    }
}
fn scale(ticks: u64, rate: u32, timescale: u32) -> Result<u64, String> {
    if timescale == 0 {
        return Err(ERROR.into());
    }
    u64::try_from((ticks as u128 * rate as u128 + timescale as u128 / 2) / timescale as u128)
        .map_err(|_| ERROR.into())
}

pub struct Window {
    pub start: u64,
    pub frames: u64,
    pub silence: u64,
}

fn timing(moov: &[u8], track_id: u32, rate: u32, total: u64) -> Result<Window, String> {
    let mvhd = required(moov, b"mvhd")?;
    let movie_scale = u32_at(mvhd, time_offset(mvhd)?)?;
    let mut children = moov;
    let mut selected = None;
    while !children.is_empty() {
        let (kind, track) = atom(&mut children)?;
        if &kind != b"trak" {
            continue;
        }
        let tkhd = required(track, b"tkhd")?;
        if u32_at(tkhd, time_offset(tkhd)?)? != track_id {
            continue;
        }
        if selected.replace(track).is_some() {
            return Err(ERROR.into());
        }
    }
    let track = selected.ok_or(ERROR)?;
    let mdhd = required(required(track, b"mdia")?, b"mdhd")?;
    let media_scale = u32_at(mdhd, time_offset(mdhd)?)?;
    if media_scale != rate {
        return Err(ERROR.into());
    }
    let mut window = Window {
        start: 0,
        frames: total,
        silence: 0,
    };
    if let Some(edts) = child(track, b"edts")? {
        let edits = required(edts, b"elst")?;
        let width = match edits.first() {
            Some(0) => 12,
            Some(1) => 20,
            _ => return Err(ERROR.into()),
        };
        let count = u32_at(edits, 4)? as usize;
        if count > 2 || edits.len() != 8 + count * width || edits[1..4] != [0, 0, 0] {
            return Err(ERROR.into());
        }
        for index in 0..count {
            let entry = &edits[8 + index * width..8 + (index + 1) * width];
            let (duration, start) = if width == 12 {
                (u32_at(entry, 0)? as u64, u32_at(entry, 4)? as i32 as i64)
            } else {
                (u64_at(entry, 0)?, u64_at(entry, 8)? as i64)
            };
            if u32_at(entry, width - 4)? != 0x00010000 {
                return Err(ERROR.into());
            }
            let frames = scale(duration, rate, movie_scale)?;
            if start == -1 && index == 0 && count == 2 {
                window.silence = frames;
            } else if start >= 0 && index == count - 1 {
                window.start = scale(start as u64, rate, media_scale)?;
                window.frames = frames;
            } else {
                return Err(ERROR.into());
            }
        }
    }
    if window.frames == 0
        || window
            .start
            .checked_add(window.frames)
            .is_none_or(|end| end > total)
    {
        return Err(ERROR.into());
    }
    Ok(window)
}

pub fn read(input: &Path, track_id: u32, rate: u32, total: u64) -> Result<Window, String> {
    let mut file = File::open(input).map_err(|e| e.to_string())?;
    let length = file.metadata().map_err(|e| e.to_string())?.len();
    let mut at = 0;
    // Metadata only: skip mdat without allocating or copying the source audio.
    for _ in 0..10000 {
        if at >= length {
            break;
        }
        let mut header = [0; 16];
        file.read_exact(&mut header[..8]).map_err(|_| ERROR)?;
        let short = u32_at(&header, 0)?;
        let (size, head) = match short {
            0 => (length - at, 8),
            1 => {
                file.read_exact(&mut header[8..]).map_err(|_| ERROR)?;
                (u64_at(&header, 8)?, 16)
            }
            size => (size as u64, 8),
        };
        if size < head || size > length - at {
            return Err(ERROR.into());
        }
        if &header[4..8] == b"moov" {
            if size - head > 8 * 1024 * 1024 {
                return Err("M4A metadata exceeds 8 MB.".into());
            }
            let mut data = vec![0; (size - head) as usize];
            file.read_exact(&mut data).map_err(|_| ERROR)?;
            return timing(&data, track_id, rate, total);
        }
        at += size;
        file.seek(SeekFrom::Start(at)).map_err(|e| e.to_string())?;
    }
    Err(ERROR.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn boxed(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        [
            ((data.len() + 8) as u32).to_be_bytes().as_slice(),
            kind,
            data,
        ]
        .concat()
    }
    fn fixture(version: u8, edits: &[(u64, i64, u32)]) -> Vec<u8> {
        let header = |number: u32| {
            let mut bytes = vec![0; if version == 0 { 12 } else { 20 }];
            bytes[0] = version;
            bytes.extend(number.to_be_bytes());
            bytes
        };
        let mut list = vec![version, 0, 0, 0];
        list.extend((edits.len() as u32).to_be_bytes());
        for &(duration, start, rate) in edits {
            if version == 0 {
                list.extend((duration as u32).to_be_bytes());
                list.extend((start as i32).to_be_bytes());
            } else {
                list.extend(duration.to_be_bytes());
                list.extend(start.to_be_bytes());
            }
            list.extend(rate.to_be_bytes());
        }
        let track = [
            boxed(b"tkhd", &header(7)),
            boxed(b"mdia", &boxed(b"mdhd", &header(44100))),
            boxed(b"edts", &boxed(b"elst", &list)),
        ]
        .concat();
        [boxed(b"mvhd", &header(1000)), boxed(b"trak", &track)].concat()
    }
    #[test]
    fn edit_lists_preserve_priming_and_leading_silence_and_refuse_ambiguous_timing() {
        for version in [0, 1] {
            let plain = fixture(version, &[(1000, 2112, 65536)]);
            let window = timing(&plain, 7, 44100, 46212).unwrap();
            assert_eq!(
                (window.start, window.frames, window.silence),
                (2112, 44100, 0)
            );
            let delayed = fixture(version, &[(250, -1, 65536), (1000, 2112, 65536)]);
            let window = timing(&delayed, 7, 44100, 46212).unwrap();
            assert_eq!(
                (window.start, window.frames, window.silence),
                (2112, 44100, 11025)
            );
            assert!(timing(&plain, 8, 44100, 46212).is_err());
            assert!(timing(&plain, 7, 48000, 46212).is_err());
            assert!(timing(&plain, 7, 44100, 46000).is_err());
            for edits in [
                vec![(1000, 0, 32768)],
                vec![(1000, -1, 65536)],
                vec![(500, 0, 65536), (500, 22050, 65536)],
                vec![(1000, -2, 65536)],
            ] {
                assert!(timing(&fixture(version, &edits), 7, 44100, 46212).is_err());
            }
            for end in 0..plain.len() {
                assert!(timing(&plain[..end], 7, 44100, 46212).is_err());
            }
        }
        for bytes in [
            vec![
                0, 0, 0, 1, b'm', b'o', b'o', b'v', 255, 255, 255, 255, 255, 255, 255, 255,
            ],
            vec![0, 0, 0, 4, b'm', b'o', b'o', b'v'],
        ] {
            assert!(atom(&mut bytes.as_slice()).is_err());
        }
    }
}
