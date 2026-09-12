import { useRef } from "react";
import { tickMeterFrame } from "../lib/meterFps";
import { useCanvasRaf } from "../lib/useCanvasRaf";

export interface MeterProps {
  peakDb: number;
  rmsDb: number;
  label: string;
  width?: string;
  /** When false, paint once and stop rAF. */
  live?: boolean;
}

/** Fill used by the meter canvas. Peak is a tick; RMS is the bar. */
export interface MeterCanvas {
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: CanvasRenderingContext2D["fillStyle"];
}

export function clampPercent(db: number): number {
  if (db < -60) return 0;
  if (db > 0) return 100;
  return ((db + 60) / 60) * 100;
}

export function paintMeter(
  ctx: MeterCanvas,
  width: number,
  height: number,
  meter: {
    peakDb: number;
    rmsDb: number;
    clip: boolean;
    colors: { bg: string; accent: string; ink: string; record: string };
  },
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = meter.colors.bg;
  ctx.fillRect(0, 0, width, height);
  const rmsPct = clampPercent(meter.rmsDb) / 100;
  ctx.fillStyle = meter.colors.accent;
  ctx.fillRect(0, 0, width * rmsPct, height);
  const peakPct = clampPercent(meter.peakDb) / 100;
  if (peakPct > 0) {
    ctx.fillStyle = meter.colors.ink;
    ctx.fillRect(Math.min(width - 2, width * peakPct), 0, 2, height);
  }
  if (meter.clip) {
    ctx.fillStyle = meter.colors.record;
    ctx.fillRect(width - 4, 0, 4, height);
  }
}

export function Meter({
  peakDb,
  rmsDb,
  label,
  width = "w-48",
  live = false,
}: MeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const values = useRef({ peakDb, rmsDb });
  values.current = { peakDb, rmsDb };
  const clipUntil = useRef(0);

  useCanvasRaf(live, () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    tickMeterFrame();
    const { peakDb: peak, rmsDb: rms } = values.current;
    if (peak >= 0) clipUntil.current = performance.now() + 1000;
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
    paintMeter(ctx, widthPx, heightPx, {
      peakDb: peak,
      rmsDb: rms,
      clip: performance.now() < clipUntil.current,
      colors: {
        bg: style.getPropertyValue("--bg-2").trim() || "#1f1c1a",
        accent: style.getPropertyValue("--accent").trim() || "#e0a24a",
        ink: style.getPropertyValue("--fg-0").trim() || "#f3ede4",
        record: style.getPropertyValue("--record").trim() || "#e0534e",
      },
    });
  });

  return (
    <div className={`flex flex-col gap-1 ${width}`} aria-live="off">
      <div className="flex justify-between text-xs font-mono text-[var(--fg-2)]">
        <span>{label}</span>
        <span className="tabular-nums">
          {peakDb > -100 ? `${peakDb.toFixed(1)} dB` : "-∞"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="h-2 w-full rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-2)]"
        aria-hidden
      />
    </div>
  );
}
