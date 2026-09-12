import type React from "react";

/** DESIGN §1: chord 96–160 px; tempo and bar 48 px. Visual two-metre check stays open. */
export const CHORD_MIN_PX = 96;
export const CHORD_MAX_PX = 160;
export const CHORD_VW = 10;
export const TEMPO_BAR_PX = 48;

/** Whole cents for the tuner; never "-0". */
export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function chordSizePx(viewportWidth: number): number {
  return Math.min(
    CHORD_MAX_PX,
    Math.max(CHORD_MIN_PX, (viewportWidth * CHORD_VW) / 100),
  );
}

export interface BigReadoutProps {
  value: string;
  subValue?: string;
  label: string;
  cents?: number;
  highlight?: boolean;
  kind?: "chord" | "tempo";
}

export const BigReadout: React.FC<BigReadoutProps> = ({
  value,
  subValue,
  label,
  cents,
  highlight = false,
  kind = "chord",
}) => {
  const fontSize =
    kind === "tempo"
      ? `${TEMPO_BAR_PX}px`
      : `clamp(${CHORD_MIN_PX}px, ${CHORD_VW}vw, ${CHORD_MAX_PX}px)`;
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
          style={{ fontSize, lineHeight: 1 }}
        >
          {value}
        </span>
        {kind === "chord" ? (
          <span
            className="text-2xl text-[var(--fg-1)] font-medium"
            aria-live="polite"
            aria-atomic="true"
          >
            {subValue ?? ""}
          </span>
        ) : (
          subValue && (
            <span className="text-2xl text-[var(--fg-1)] font-medium">
              {subValue}
            </span>
          )
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
          {formatCents(cents)} ¢
        </span>
      )}
    </div>
  );
};
