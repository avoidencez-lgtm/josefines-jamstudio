export type ReducedMotion = "system" | "on" | "off";

export function readReducedMotion(settings: unknown): ReducedMotion {
  if (!settings || typeof settings !== "object") return "system";
  const ui = (settings as { ui?: unknown }).ui;
  if (!ui || typeof ui !== "object") return "system";
  const value = (ui as { reducedMotion?: unknown }).reducedMotion;
  return value === "on" || value === "off" || value === "system"
    ? value
    : "system";
}

export function applyReducedMotion(mode: ReducedMotion) {
  const reduce =
    mode === "on" ||
    (mode === "system" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.documentElement.classList.toggle("reduce-motion", reduce);
  document.documentElement.classList.toggle("allow-motion", mode === "off");
}
