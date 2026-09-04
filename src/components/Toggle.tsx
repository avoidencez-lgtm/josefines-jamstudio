import type React from "react";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  disabled,
}) => {
  return (
    <div
      className={`inline-flex items-center gap-2 ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors relative border border-[var(--line)] cursor-pointer ${
          checked ? "bg-[var(--accent)]" : "bg-[var(--bg-2)]"
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full transition-transform bg-[var(--fg-0)] absolute top-0.5 left-0.5 ${
            checked ? "translate-x-5 !bg-[var(--bg-0)]" : "translate-x-0"
          }`}
        />
      </button>
      {label && <span className="text-sm text-[var(--fg-1)]">{label}</span>}
    </div>
  );
};
