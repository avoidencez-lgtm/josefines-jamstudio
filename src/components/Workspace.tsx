import type { ReactNode } from "react";
import { SCREENS, SCREEN_ICONS } from "../screens/registry";
import type { ScreenId } from "../store/engine";

export function WorkspaceHeader({
  screen,
  title,
  description,
  children,
}: {
  screen: ScreenId;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const room = SCREENS.find((s) => s.id === screen);
  if (!room) throw new Error(`Unknown studio room: ${screen}`);
  const Icon = SCREEN_ICONS[room.iconName];
  return (
    <header className="workspace-heading">
      <div className="workspace-title">
        <Icon size={32} aria-hidden="true" />
        <div>
          <span className="workspace-eyebrow">
            {room.label} / {room.description}
          </span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children && <div className="workspace-actions">{children}</div>}
    </header>
  );
}

/** Native buttons stay in the tab order; aria-pressed announces the active view. */
export function WorkspaceViews({
  labels,
  value,
  onChange,
}: {
  labels: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="workspace-views" aria-label="Workspace view">
      {labels.map((label) => (
        <button
          type="button"
          key={label}
          aria-pressed={value === label}
          onClick={() => onChange(label)}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
