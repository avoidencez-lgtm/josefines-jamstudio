import { useEffect, useState } from "react";
import { committedNumber } from "../lib/numberField";

/** Commit a typed number on blur or Enter. Empty or garbage keeps the last value. */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  className,
  inputClassName,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  className?: string;
  inputClassName?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = committedNumber(draft, value, min, max, step);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <label className={className}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={inputClassName}
      />
      {suffix ? <span>{suffix}</span> : null}
    </label>
  );
}
