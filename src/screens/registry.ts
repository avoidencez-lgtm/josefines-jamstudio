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
    description: "Compose and arrange this.",
  },
  {
    id: "stage",
    label: "Stage",
    iconName: "MicrophoneStage",
    description: "Play and rehearse this.",
  },
  {
    id: "library",
    label: "Library",
    iconName: "FolderOpen",
    description: "These are charts and grooves.",
  },
  {
    id: "jo",
    label: "Jo AI",
    iconName: "ChatCircleDots",
    description: "Talk to your band.",
  },
  {
    id: "songs",
    label: "Songs",
    iconName: "VinylRecord",
    description: "These are mixes and references.",
  },
  {
    id: "ai-music",
    label: "AI Music",
    iconName: "Waveform",
    description: "Generate this music.",
  },
  {
    id: "music-video",
    label: "Film",
    iconName: "FilmSlate",
    description: "Direct these music videos.",
  },
  {
    id: "sessions",
    label: "Sessions",
    iconName: "CassetteTape",
    description: "These are takes and exports.",
  },
  { id: "rig", label: "Rig", iconName: "Guitar", description: "These are pedals and MIDI." },
  {
    id: "settings",
    label: "Settings",
    iconName: "Gear",
    description: "These are audio and connections.",
  },
];
