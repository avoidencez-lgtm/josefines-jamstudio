import type React from "react";

export const StatusPill: React.FC<{
  status: "live" | "ok" | "idle" | "error";
  label: string;
}> = ({ status, label }) => {
  const colors = {
    live: "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]",
    ok: "bg-[rgba(88,181,133,0.16)] text-[var(--ok)] border-[var(--ok)]",
    idle: "bg-[var(--bg-2)] text-[var(--fg-2)] border-[var(--line)]",
    error:
      "bg-[rgba(224,83,78,0.16)] text-[var(--record)] border-[var(--record)]",
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

export const EmptyState: React.FC<{
  title: string;
  message: string;
  action?: React.ReactNode;
}> = ({ title, message, action }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <h4 className="text-base font-medium text-[var(--fg-0)] mb-1">{title}</h4>
      <p className="text-sm text-[var(--fg-2)] max-w-sm mb-4">{message}</p>
      {action}
    </div>
  );
};

export const ErrorState: React.FC<{ error: string; onRetry?: () => void }> = ({
  error,
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[rgba(224,83,78,0.08)] border border-[var(--record)] rounded-[var(--radius-m)] text-center">
      <span className="text-sm text-[var(--record)] font-mono mb-3">
        {error}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs uppercase tracking-wider font-mono text-[var(--fg-0)] underline cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
};
