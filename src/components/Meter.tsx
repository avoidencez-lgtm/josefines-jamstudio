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

function clampPercent(db: number): number {
  if (db < -60) return 0;
  if (db > 0) return 100;
  return ((db + 60) / 60) * 100;
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
    const bg = style.getPropertyValue("--bg-2").trim() || "#1f1c1a";
    const accent = style.getPropertyValue("--accent").trim() || "#e0a24a";
    const ink = style.getPropertyValue("--fg-0").trim() || "#f3ede4";
    const record = style.getPropertyValue("--record").trim() || "#e0534e";
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, widthPx, heightPx);
    const rmsPct = clampPercent(rms) / 100;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, widthPx * rmsPct, heightPx);
    const peakPct = clampPercent(peak) / 100;
    if (peakPct > 0) {
      ctx.fillStyle = ink;
      ctx.fillRect(Math.min(widthPx - 2, widthPx * peakPct), 0, 2, heightPx);
    }
    if (performance.now() < clipUntil.current) {
      ctx.fillStyle = record;
      ctx.fillRect(widthPx - 4, 0, 4, heightPx);
    }
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
        className="h-2 w-full rounded-[var(--radius-s)] border border-[var(--line)] bg-[var(--bg-2)]"
        aria-hidden
      />
    </div>
  );
}
