import {
  CassetteTape,
  ChatCircleDots,
  FilmSlate,
  FolderOpen,
  Gear,
  Guitar,
  MicrophoneStage,
  NotePencil,
  VinylRecord,
  Waveform,
} from "@phosphor-icons/react";
import type { ScreenId } from "../store/engine";

export const SCREEN_ICONS = {
  NotePencil,
  MicrophoneStage,
  FolderOpen,
  ChatCircleDots,
  VinylRecord,
  Waveform,
  FilmSlate,
  CassetteTape,
  Guitar,
  Gear,
};
export interface ScreenDescriptor {
  id: ScreenId;
  label: string;
  iconName: keyof typeof SCREEN_ICONS;
  description: string;
}
export const SCREENS: ScreenDescriptor[] = [
  {
    id: "originals",
    label: "Write",
    iconName: "NotePencil",
    description: "Compose & arrange",
  },
  {
    id: "stage",
    label: "Stage",
    iconName: "MicrophoneStage",
    description: "Play & rehearse",
  },
  {
    id: "library",
    label: "Library",
    iconName: "FolderOpen",
    description: "Charts & grooves",
  },
  {
    id: "jo",
    label: "Jo AI",
    iconName: "ChatCircleDots",
    description: "Talk to your band",
  },
  {
    id: "songs",
    label: "Songs",
    iconName: "VinylRecord",
    description: "Mixes & references",
  },
  {
    id: "ai-music",
    label: "AI Music",
    iconName: "Waveform",
    description: "Generate music",
  },
  {
    id: "music-video",
    label: "Film",
    iconName: "FilmSlate",
    description: "Direct music videos",
  },
  {
    id: "sessions",
    label: "Sessions",
    iconName: "CassetteTape",
    description: "Takes & exports",
  },
  { id: "rig", label: "Rig", iconName: "Guitar", description: "Pedals & MIDI" },
  {
    id: "settings",
    label: "Settings",
    iconName: "Gear",
    description: "Audio & connections",
  },
];
