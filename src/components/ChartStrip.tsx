import type React from "react";

export const ChartStrip: React.FC<{
  bars: string[];
  currentBar: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  onSeek: (bar: number) => void;
}> = ({ bars, currentBar, loopEnabled, loopStart, loopEnd, onSeek }) => {
  if (bars.length === 0) return null;
  const playIdx =
    (((currentBar - 1) % bars.length) + bars.length) % bars.length;

  return (
    <div className="flex gap-1 overflow-x-auto pb-1" aria-label="Chart">
      {bars.map((chord, i) => {
        const barNum = i + 1;
        const active = i === playIdx;
        const inLoop = loopEnabled && barNum >= loopStart && barNum < loopEnd;
        return (
          <button
            key={`${barNum}-${chord}`}
            type="button"
            onClick={() => onSeek(barNum)}
            className={`min-w-16 h-12 px-2 rounded-[var(--radius-m)] font-mono text-sm tabular-nums border cursor-pointer ${
              active
                ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                : inLoop
                  ? "bg-[var(--bg-2)] border-[var(--accent)] text-[var(--fg-0)]"
                  : "bg-[var(--bg-1)] border-[var(--line)] text-[var(--fg-1)] hover:bg-[var(--bg-3)]"
            }`}
          >
            {chord}
          </button>
        );
      })}
    </div>
  );
};
