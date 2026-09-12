//! Process CPU sample for Settings → Diagnostics. Never marks DESIGN 3% proven.
use serde::Serialize;
use std::time::{Duration, Instant};

pub const NOT_PROVEN: &str = "Idle CPU is not proven. DESIGN under 3% needs a desktop WebView+engine idle fixture, not a headless or preview sample.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdleCpuSample {
    pub percent: Option<f32>,
    pub seconds: f32,
    pub headless: bool,
    pub proven: bool,
    pub message: String,
}

pub fn sample(window: Duration) -> IdleCpuSample {
    let headless = std::env::var("JAM_HEADLESS").as_deref() == Ok("1");
    let seconds = window.as_secs_f32();
    let Some(start) = process_cpu_seconds() else {
        return IdleCpuSample {
            percent: None,
            seconds,
            headless,
            proven: false,
            message: format!("Process CPU sample is not configured on this OS. {NOT_PROVEN}"),
        };
    };
    let wall0 = Instant::now();
    std::thread::sleep(window);
    let wall = wall0.elapsed().as_secs_f64().max(1e-6);
    let percent = process_cpu_seconds().map(|end| (100.0 * (end - start).max(0.0) / wall) as f32);
    let measured = percent
        .map(|p| format!("This process used {p:.1}% of one core over {seconds:.1} s. "))
        .unwrap_or_default();
    IdleCpuSample {
        percent,
        seconds,
        headless,
        proven: false,
        message: format!("{measured}{NOT_PROVEN}"),
    }
}

#[cfg(windows)]
fn process_cpu_seconds() -> Option<f64> {
    #[repr(C)]
    struct FileTime {
        lo: u32,
        hi: u32,
    }
    extern "system" {
        fn GetCurrentProcess() -> *mut core::ffi::c_void;
        fn GetProcessTimes(
            process: *mut core::ffi::c_void,
            created: *mut FileTime,
            exited: *mut FileTime,
            kernel: *mut FileTime,
            user: *mut FileTime,
        ) -> i32;
    }
    fn secs(t: FileTime) -> f64 {
        let ticks = (u64::from(t.hi) << 32) | u64::from(t.lo);
        ticks as f64 * 1e-7
    }
    unsafe {
        let mut created = FileTime { lo: 0, hi: 0 };
        let mut exited = FileTime { lo: 0, hi: 0 };
        let mut kernel = FileTime { lo: 0, hi: 0 };
        let mut user = FileTime { lo: 0, hi: 0 };
        if GetProcessTimes(
            GetCurrentProcess(),
            &mut created,
            &mut exited,
            &mut kernel,
            &mut user,
        ) == 0
        {
            return None;
        }
        Some(secs(kernel) + secs(user))
    }
}

#[cfg(unix)]
fn process_cpu_seconds() -> Option<f64> {
    #[cfg(target_os = "macos")]
    #[repr(C)]
    struct TimeVal {
        sec: i64,
        usec: i32,
        _pad: i32,
    }
    #[cfg(not(target_os = "macos"))]
    #[repr(C)]
    struct TimeVal {
        sec: i64,
        usec: i64,
    }
    #[repr(C)]
    struct Rusage {
        utime: TimeVal,
        stime: TimeVal,
        _rest: [u64; 18],
    }
    unsafe extern "C" {
        fn getrusage(who: i32, usage: *mut Rusage) -> i32;
    }
    const RUSAGE_SELF: i32 = 0;
    fn secs(t: TimeVal) -> f64 {
        t.sec as f64 + t.usec as f64 * 1e-6
    }
    unsafe {
        let mut usage = std::mem::zeroed();
        if getrusage(RUSAGE_SELF, &mut usage) != 0 {
            return None;
        }
        Some(secs(usage.utime) + secs(usage.stime))
    }
}

#[cfg(not(any(windows, unix)))]
fn process_cpu_seconds() -> Option<f64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_sample_is_finite_and_never_proven() {
        let sample = sample(Duration::from_millis(50));
        assert!(!sample.proven, "{sample:?}");
        assert!(
            sample.message.contains("Idle CPU is not proven"),
            "{sample:?}"
        );
        assert!(sample.message.contains("WebView+engine"), "{sample:?}");
        if let Some(percent) = sample.percent {
            assert!(percent.is_finite() && percent >= 0.0, "{percent}");
            assert!(percent < 400.0, "implausible {percent}%");
        }
    }
}
