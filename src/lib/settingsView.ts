import { create } from "zustand";
import { useEngineStore } from "../store/engine";

/** Which Settings view is open; other rooms deep-link into the AI page through it. */
export const useSettingsView = create(() => ({
  view: "This is Audio devices.",
}));

export function openSettings(view = "This is Audio devices.") {
  useSettingsView.setState({ view });
  useEngineStore.getState().setScreen("settings");
}

export function openAiSettings() {
  openSettings("These are the AI and models.");
}
