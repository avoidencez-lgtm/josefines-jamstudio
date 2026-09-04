import type React from "react";
import { SHORTCUTS } from "../lib/shortcuts";
import { Button } from "./Button";

export const ShortcutsHelp: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  if (!open) return null;
  const groups = ["Transport", "Band", "Practice", "App"] as const;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
    >
      <dialog
        open
        className="relative bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--radius-l)] max-w-2xl w-full p-6 shadow-2xl text-[var(--fg-0)] m-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
            Keyboard Shortcuts
          </h2>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs font-mono text-[var(--fg-1)]">
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--fg-2)] mb-1.5">
                {g}
              </div>
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <div
                  key={s.keys}
                  className="flex justify-between gap-4 py-1 border-b border-[var(--line)] last:border-b-0"
                >
                  <span className="text-[var(--fg-0)] whitespace-nowrap">
                    {s.keys}
                  </span>
                  <span className="text-right">{s.description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--fg-2)] mt-2 font-mono">
          Shortcuts are off while typing in a text field. In the chart editor,
          Ctrl/Cmd+Enter plays the chart and Ctrl/Cmd+S saves it.
        </p>
      </dialog>
    </div>
  );
};
