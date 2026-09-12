import type React from "react";

export const StatusPill: React.FC<{
  status: "live" | "ok" | "idle" | "error";
  label: string;
}> = ({ status, label }) => {
  const colors = {
    live: "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]",
    ok: "bg-[var(--ok-soft)] text-[var(--ok)] border-[var(--ok)]",
    idle: "bg-[var(--bg-2)] text-[var(--fg-2)] border-[var(--line)]",
    error:
      "bg-[var(--record-soft)] text-[var(--record)] border-[var(--record)]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono uppercase tracking-wider border ${colors[status]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};
