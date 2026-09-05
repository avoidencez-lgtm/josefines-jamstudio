import { create } from "zustand";
import { useEngineStore } from "../store/engine";

/** Which Settings view is open; other rooms deep-link into the AI page through it. */
export const useSettingsView = create(() => ({ view: "Audio devices" }));

export function openAiSettings() {
  useSettingsView.setState({ view: "AI & models" });
  useEngineStore.getState().setScreen("settings");
}
