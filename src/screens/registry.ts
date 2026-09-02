export interface ScreenDescriptor {
  id: "stage" | "library" | "sessions" | "rig" | "settings";
  label: string;
  iconName: string;
}

export const SCREENS: ScreenDescriptor[] = [
  { id: "stage", label: "Stage", iconName: "Guitar" },
  { id: "library", label: "Library", iconName: "MusicNotes" },
  { id: "sessions", label: "Sessions", iconName: "Waveform" },
  { id: "rig", label: "Rig", iconName: "Sliders" },
  { id: "settings", label: "Settings", iconName: "Gear" },
];
