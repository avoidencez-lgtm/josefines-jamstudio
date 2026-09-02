import type React from "react";

export interface PanelProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export const Panel: React.FC<PanelProps> = ({
  children,
  className = "",
  title,
}) => {
  return (
    <div
      className={`bg-[var(--bg-1)] border border-[var(--line)] rounded-[var(--radius-l)] p-5 ${className}`}
    >
      {title && (
        <h3 className="text-xs uppercase tracking-wider font-mono text-[var(--fg-2)] mb-4">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};
