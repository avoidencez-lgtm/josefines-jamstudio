import type { ScreenId } from "../store/engine";

export interface ScreenDescriptor {
  id: ScreenId;
  label: string;
  iconName: string;
}

export const SCREENS: ScreenDescriptor[] = [
  { id: "stage", label: "Stage", iconName: "Guitar" },
  { id: "library", label: "Library", iconName: "BookOpen" },
  { id: "jo", label: "Jo AI", iconName: "Microphone" },
  { id: "songs", label: "Songs", iconName: "MusicNotes" },
  { id: "ai-music", label: "AI Music", iconName: "Waveform" },
  { id: "sessions", label: "Sessions", iconName: "Record" },
  { id: "rig", label: "Rig", iconName: "Sliders" },
  { id: "settings", label: "Settings", iconName: "Gear" },
];
