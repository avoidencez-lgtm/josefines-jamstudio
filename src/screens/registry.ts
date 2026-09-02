export interface ScreenDescriptor {
  id: "stage" | "jo" | "songs" | "ai-music" | "sessions" | "rig" | "settings";
  label: string;
  iconName: string;
}

export const SCREENS: ScreenDescriptor[] = [
  { id: "stage", label: "Stage", iconName: "Guitar" },
  { id: "jo", label: "Jo", iconName: "Microphone" },
  { id: "songs", label: "Songs", iconName: "MusicNotes" },
  { id: "ai-music", label: "AI Music", iconName: "Waveform" },
  { id: "sessions", label: "Sessions", iconName: "Record" },
  { id: "rig", label: "Rig", iconName: "Sliders" },
  { id: "settings", label: "Settings", iconName: "Gear" },
];
