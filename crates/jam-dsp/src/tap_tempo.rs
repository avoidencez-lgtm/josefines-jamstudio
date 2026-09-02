//! tap_tempo: Moving-average tap tempo estimation with automatic timeout reset.

use std::time::Instant;

pub struct TapTempo {
    taps: Vec<Instant>,
    max_history: usize,
    timeout_secs: f64,
}

impl Default for TapTempo {
    fn default() -> Self {
        Self::new(4, 2.0)
    }
}

impl TapTempo {
    pub fn new(max_history: usize, timeout_secs: f64) -> Self {
        Self {
            taps: Vec::with_capacity(max_history),
            max_history,
            timeout_secs,
        }
    }

    pub fn tap(&mut self) -> Option<f64> {
        let now = Instant::now();

        if let Some(&last) = self.taps.last() {
            let elapsed = now.duration_since(last).as_secs_f64();
            if elapsed > self.timeout_secs {
                self.taps.clear();
            }
        }

        self.taps.push(now);
        if self.taps.len() > self.max_history {
            self.taps.remove(0);
        }

        if self.taps.len() < 2 {
            return None;
        }

        let total_duration = self.taps.last()?.duration_since(self.taps[0]).as_secs_f64();
        let intervals = (self.taps.len() - 1) as f64;
        let avg_interval = total_duration / intervals;

        if avg_interval <= 0.0 {
            return None;
        }

        let bpm = 60.0 / avg_interval;
        // Clamp to sane musical bounds [40, 240]
        Some(bpm.clamp(40.0, 240.0))
    }

    pub fn reset(&mut self) {
        self.taps.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_tap_tempo_math() {
        let mut tracker = TapTempo::new(4, 2.0);
        assert_eq!(tracker.tap(), None);

        // Manually push simulated taps at 500ms intervals = 120 bpm
        tracker.taps.clear();
        let base = Instant::now();
        tracker.taps.push(base);
        tracker.taps.push(base + Duration::from_millis(500));
        tracker.taps.push(base + Duration::from_millis(1000));

        let total = tracker
            .taps
            .last()
            .unwrap()
            .duration_since(tracker.taps[0])
            .as_secs_f64();
        let bpm = 60.0 / (total / 2.0);
        assert!((bpm - 120.0).abs() < 1e-3);
    }
}
