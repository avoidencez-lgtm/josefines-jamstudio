import type React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  const variants = {
    primary:
      "bg-[var(--accent)] text-[var(--bg-0)] hover:bg-[var(--accent-strong)] font-semibold",
    secondary:
      "bg-[var(--bg-2)] text-[var(--fg-0)] hover:bg-[var(--bg-3)] border border-[var(--line)]",
    danger:
      "bg-[var(--record)] text-[var(--fg-0)] hover:opacity-90 font-semibold",
    ghost:
      "bg-transparent text-[var(--fg-1)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)]",
  };

  const sizes = {
    sm: "px-2 py-1 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
