import type React from "react";

export interface MeterProps {
  peakDb: number;
  rmsDb: number;
  label: string;
  width?: string;
}

export const Meter: React.FC<MeterProps> = ({
  peakDb,
  rmsDb,
  label,
  width = "w-48",
}) => {
  // Convert -60 dB to 0 dB into percentage [0, 100]
  const clampPercent = (db: number) => {
    if (db < -60) return 0;
    if (db > 0) return 100;
    return ((db + 60) / 60) * 100;
  };

  const peakPct = clampPercent(peakDb);
  const rmsPct = clampPercent(rmsDb);

  return (
    <div className={`flex flex-col gap-1 ${width}`}>
      <div className="flex justify-between text-xs font-mono text-[var(--fg-2)]">
        <span>{label}</span>
        <span className="tabular-nums">
          {peakDb > -100 ? `${peakDb.toFixed(1)} dB` : "-∞"}
        </span>
      </div>
      <div className="h-2 bg-[var(--bg-2)] rounded-sm overflow-hidden relative border border-[var(--line)]">
        {/* RMS fill */}
        <div
          className="h-full bg-[var(--accent)] transition-all duration-75"
          style={{ width: `${rmsPct}%` }}
        />
        {/* Peak indicator tick */}
        {peakPct > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[var(--fg-0)]"
            style={{ left: `${Math.min(99, peakPct)}%` }}
          />
        )}
      </div>
    </div>
  );
};
