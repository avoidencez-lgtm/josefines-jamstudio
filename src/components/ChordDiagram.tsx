import type { Voicing } from "../lib/theory/voicings";

const STRING_NAMES = ["low E", "A", "D", "G", "B", "high E"];
const ROWS = 4;
const FRET_LINES = ["nut", "fret-1", "fret-2", "fret-3", "fret-4"];

/**
 * A chord box: six strings, four frets from the shape's position, the root in
 * the accent colour, interval labels in the dots. Inline SVG on the design tokens;
 * nothing animates.
 */
export function ChordDiagram({
  symbol,
  voicing,
  compact = false,
  tone = "primary",
}: {
  symbol: string;
  voicing: Voicing;
  compact?: boolean;
  tone?: "primary" | "secondary";
}) {
  const sx = compact ? 14 : 20;
  const fy = compact ? 17 : 24;
  const radius = compact ? 5 : 8;
  const x0 = 18;
  const y0 = 16;
  const width = x0 + sx * 5 + 12;
  const height = y0 + fy * ROWS + 6;
  const x = (string: number) => x0 + string * sx;
  const rowY = (fret: number) => y0 + (fret - voicing.position + 0.5) * fy;
  const ink = tone === "primary" ? "var(--fg-0)" : "var(--fg-1)";
  const fretted = voicing.frets.filter((f) => f > 0);
  const lowest = fretted.length ? Math.min(...fretted) : 0;
  const rootString = voicing.labels.findIndex((l) => l === "R");
  const description = `${symbol} shape ${voicing.shape}${
    rootString >= 0 ? `, root on the ${STRING_NAMES[rootString]} string` : ""
  }${voicing.position > 1 ? `, from fret ${voicing.position}` : ""}`;
  return (
    <svg
      role="img"
      aria-label={description}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="chord-diagram"
    >
      <title>{description}</title>
      {/* nut or position label */}
      {voicing.position === 1 ? (
        <rect
          x={x(0) - 1}
          y={y0 - 2}
          width={sx * 5 + 2}
          height={3}
          fill={ink}
        />
      ) : (
        <text
          x={x0 - 6}
          y={rowY(voicing.position) + 3.5}
          textAnchor="end"
          fontSize={compact ? 8 : 9}
          fontFamily="var(--font-mono)"
          fill="var(--fg-2)"
        >
          {voicing.position}fr
        </text>
      )}
      {/* frets and strings */}
      {FRET_LINES.map((name, i) => (
        <line
          key={name}
          x1={x(0)}
          x2={x(5)}
          y1={y0 + i * fy}
          y2={y0 + i * fy}
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}
      {voicing.frets.map((fret, string) => (
        <line
          key={`string-${STRING_NAMES[string]}`}
          x1={x(string)}
          x2={x(string)}
          y1={y0}
          y2={y0 + ROWS * fy}
          stroke={fret < 0 ? "var(--line)" : "var(--fg-2)"}
          strokeWidth={1}
        />
      ))}
      {/* open and muted markers above the nut */}
      {voicing.frets.map((fret, string) =>
        fret === 0 ? (
          <circle
            key={`open-${STRING_NAMES[string]}`}
            cx={x(string)}
            cy={y0 - 9}
            r={compact ? 3 : 3.5}
            fill={
              voicing.labels[string] === "R" ? "var(--accent-soft)" : "none"
            }
            stroke={voicing.labels[string] === "R" ? "var(--accent)" : ink}
            strokeWidth={voicing.labels[string] === "R" ? 1.8 : 1.2}
          />
        ) : fret < 0 ? (
          <text
            key={`mute-${STRING_NAMES[string]}`}
            x={x(string)}
            y={y0 - 6}
            textAnchor="middle"
            fontSize={compact ? 8 : 9}
            fontFamily="var(--font-mono)"
            fill="var(--fg-2)"
          >
            x
          </text>
        ) : null,
      )}
      {/* index barre, drawn under the dots */}
      {voicing.barre && lowest > 0 && (
        <rect
          x={x(voicing.barre[0]) - radius}
          y={rowY(lowest) - radius}
          width={x(voicing.barre[1]) - x(voicing.barre[0]) + radius * 2}
          height={radius * 2}
          rx={radius}
          fill={ink}
          opacity={0.55}
        />
      )}
      {/* fingered notes */}
      {voicing.frets.map((fret, string) => {
        if (fret <= 0) return null;
        const label = voicing.labels[string];
        const root = label === "R";
        return (
          <g key={`dot-${STRING_NAMES[string]}`}>
            <circle
              cx={x(string)}
              cy={rowY(fret)}
              r={radius}
              fill={root ? "var(--accent)" : ink}
            />
            {!compact && label && (
              <text
                x={x(string)}
                y={rowY(fret) + 3}
                textAnchor="middle"
                fontSize={8}
                fontFamily="var(--font-mono)"
                fontWeight={600}
                fill="var(--bg-0)"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
