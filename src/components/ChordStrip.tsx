import type React from "react";
import { useEffect, useRef } from "react";
import type { Chart } from "../ipc/contract";
import { resolveChart } from "../lib/chart/text";
import { tickPlayheadFrame } from "../lib/meterFps";
import { useCanvasRaf } from "../lib/useCanvasRaf";

/** Fill used by the canvas playhead. Progress is 0..1 across the current bar. */
export function paintPlayhead(
  ctx: CanvasFill,
  width: number,
  height: number,
  progress: number,
  colors: { bg: string; accent: string },
): void {
  const p = Math.min(1, Math.max(0, progress));
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(0, 0, width * p, height);
}

export interface CanvasFill {
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: CanvasRenderingContext2D["fillStyle"];
}

function PlayheadBar({ progress, live }: { progress: number; live: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const value = useRef(progress);
  value.current = progress;

  useCanvasRaf(live, () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    tickPlayheadFrame();
    const dpr = window.devicePixelRatio || 1;
    const widthPx = canvas.clientWidth;
    const heightPx = canvas.clientHeight;
    if (
      canvas.width !== Math.round(widthPx * dpr) ||
      canvas.height !== Math.round(heightPx * dpr)
    ) {
      canvas.width = Math.round(widthPx * dpr);
      canvas.height = Math.round(heightPx * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const style = getComputedStyle(canvas);
    paintPlayhead(ctx, widthPx, heightPx, value.current, {
      bg: style.getPropertyValue("--bg-2").trim() || "#1f1c1a",
      accent: style.getPropertyValue("--accent").trim() || "#e0a24a",
    });
  });

  return (
    <canvas
      className="absolute left-0 right-0 bottom-0 h-0.5 w-full bg-[var(--bg-2)]"
      aria-hidden
    />
  );
}

export interface ChordStripProps {
  chart: Chart | null;
  /** 1-indexed current bar from the transport. */
  currentBar: number;
  barProgress: number;
  loop?: { enabled: boolean; startBar: number; endBar: number };
  onSeek?: (bar: number) => void;
  onSetLoop?: (startBar: number, endBar: number) => void;
  compact?: boolean;
  /** When false, the playhead paints once and stops rAF. */
  live?: boolean;
}

/** Horizontal metrics the strip needs; keeps tests off jsdom. */
export interface StripBox {
  clientWidth: number;
  getBoundingClientRect: () => {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  scrollTo: (opts: { left: number; behavior?: ScrollBehavior }) => void;
}

/**
 * Center `bar` inside `strip` only. `scrollIntoView` would also move the room.
 * Off-screen strips are left alone so a playing chart does not yank Stage/Library.
 */
export function scrollBarInStrip(
  strip: StripBox,
  bar: { offsetLeft: number; offsetWidth: number },
  viewport: { innerWidth: number; innerHeight: number },
): void {
  const r = strip.getBoundingClientRect();
  if (
    r.bottom <= 0 ||
    r.top >= viewport.innerHeight ||
    r.right <= 0 ||
    r.left >= viewport.innerWidth
  ) {
    return;
  }
  strip.scrollTo({
    left: bar.offsetLeft - strip.clientWidth / 2 + bar.offsetWidth / 2,
    behavior: "smooth",
  });
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
  live = false,
}) => {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    const strip = stripRef.current;
    const bar = currentRef.current;
    if (currentBar <= 0 || !strip || !bar) return;
    scrollBarInStrip(strip, bar, window);
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
    <div
      ref={stripRef}
      className="relative flex gap-1 overflow-x-auto pb-2 pt-4 px-1 scroll-smooth [scrollbar-width:thin]"
    >
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
            title={`This is bar ${bar.barIndex} (${bar.sectionName}). Click it to jump. Shift-click it to loop.`}
            className={`relative shrink-0 rounded-[var(--radius-m)] border text-left font-mono cursor-pointer ${
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
            {isCurrent && <PlayheadBar progress={barProgress} live={live} />}
          </button>
        );
      })}
    </div>
  );
};
