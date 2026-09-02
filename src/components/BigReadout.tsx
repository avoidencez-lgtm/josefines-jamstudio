import type React from "react";

export interface BigReadoutProps {
  value: string;
  subValue?: string;
  label: string;
  cents?: number;
  highlight?: boolean;
}

export const BigReadout: React.FC<BigReadoutProps> = ({
  value,
  subValue,
  label,
  cents,
  highlight = false,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <span className="text-xs uppercase tracking-widest text-[var(--fg-2)] mb-1 font-mono">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-semibold font-mono tracking-tight tabular-nums select-none ${
            highlight ? "text-[var(--accent)]" : "text-[var(--fg-0)]"
          }`}
          style={{ fontSize: "clamp(48px, 8vw, 120px)", lineHeight: 1 }}
        >
          {value}
        </span>
        {subValue && (
          <span className="text-2xl text-[var(--fg-1)] font-medium">
            {subValue}
          </span>
        )}
      </div>
      {cents !== undefined && (
        <span
          className={`text-sm font-mono mt-2 tabular-nums ${
            Math.abs(cents) < 3
              ? "text-[var(--ok)]"
              : Math.abs(cents) < 10
                ? "text-[var(--accent)]"
                : "text-[var(--fg-1)]"
          }`}
        >
          {cents > 0 ? `+${cents.toFixed(0)}` : cents.toFixed(0)} ¢
        </span>
      )}
    </div>
  );
};
