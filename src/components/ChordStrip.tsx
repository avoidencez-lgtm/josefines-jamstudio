import type React from "react";
import { useEffect, useRef } from "react";
import type { Chart } from "../ipc/contract";
import { resolveChart } from "../lib/chart/text";

export interface ChordStripProps {
  chart: Chart | null;
  /** 1-indexed current bar from the transport. */
  currentBar: number;
  barProgress: number;
  loop?: { enabled: boolean; startBar: number; endBar: number };
  onSeek?: (bar: number) => void;
  onSetLoop?: (startBar: number, endBar: number) => void;
  compact?: boolean;
}

/**
 * The whole form as a row of bars, current bar lit, section names above. Click a bar
 * to jump there; shift-click a second bar to loop the span between them.
 */
export const ChordStrip: React.FC<ChordStripProps> = ({
  chart,
  currentBar,
  barProgress,
  loop,
  onSeek,
  onSetLoop,
  compact = false,
}) => {
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    if (currentBar <= 0) return;
    currentRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [currentBar]);

  if (!chart) {
    return (
      <div className="text-xs font-mono text-[var(--fg-2)] px-2 py-3">
        No chart loaded.
      </div>
    );
  }

  const bars = resolveChart(chart);
  const beatsPerBar = chart.timeSig[0];

  const handleClick = (e: React.MouseEvent, barIndex: number) => {
    if (e.shiftKey && onSetLoop) {
      const from = anchor.current ?? currentBar;
      const lo = Math.min(from, barIndex);
      const hi = Math.max(from, barIndex);
      onSetLoop(lo, hi + 1);
      anchor.current = null;
      return;
    }
    anchor.current = barIndex;
    onSeek?.(barIndex);
  };

  let lastSection = "";
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 pt-4 px-1 scroll-smooth [scrollbar-width:thin]">
      {bars.map((bar) => {
        const isCurrent = bar.barIndex === currentBar;
        const inLoop =
          loop?.enabled &&
          bar.barIndex >= loop.startBar &&
          bar.barIndex < loop.endBar;
        const showSection = bar.sectionName !== lastSection;
        lastSection = bar.sectionName;
        return (
          <button
            key={bar.barIndex}
            type="button"
            ref={isCurrent ? currentRef : undefined}
            onClick={(e) => handleClick(e, bar.barIndex)}
            title={`Bar ${bar.barIndex} (${bar.sectionName}) — click to jump, shift-click to loop`}
            className={`relative shrink-0 rounded-[var(--radius-m)] border text-left font-mono transition-colors cursor-pointer ${
              compact ? "min-w-[64px] px-2 py-1.5" : "min-w-[88px] px-3 py-2"
            } ${
              isCurrent
                ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--fg-0)]"
                : inLoop
                  ? "bg-[var(--bg-2)] border-[var(--accent)]/50 text-[var(--fg-0)]"
                  : "bg-[var(--bg-1)] border-[var(--line)] text-[var(--fg-1)] hover:bg-[var(--bg-2)]"
            }`}
          >
            {showSection && (
              <span className="absolute -top-3.5 left-1 text-[9px] uppercase tracking-wider text-[var(--fg-2)] whitespace-nowrap">
                {bar.sectionName}
              </span>
            )}
            <span className="absolute top-0.5 right-1.5 text-[9px] text-[var(--fg-2)] tabular-nums">
              {bar.barIndex}
            </span>
            <div
              className={`flex items-baseline gap-1.5 ${compact ? "text-xs" : "text-sm"} font-semibold pt-1`}
            >
              {bar.chords.map((c, i) => (
                <span
                  key={`${bar.barIndex}-${i}-${c.chord}`}
                  className="whitespace-nowrap"
                >
                  {c.chord}
                  {bar.chords.length > 1 &&
                    Math.abs(c.beats - beatsPerBar / bar.chords.length) >
                      1e-6 && (
                      <sub className="text-[9px] text-[var(--fg-2)] ml-0.5">
                        {c.beats}
                      </sub>
                    )}
                </span>
              ))}
            </div>
            {isCurrent && (
              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-[var(--bg-2)] rounded-b overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)]"
                  style={{ width: `${Math.round(barProgress * 100)}%` }}
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
