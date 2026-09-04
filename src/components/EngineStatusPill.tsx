import type React from "react";
import type { EngineStatus } from "../ipc/contract";
import { StatusPill } from "./States";

/** Compact "is the audio actually running?" indicator for the top bar. */
export const EngineStatusPill: React.FC<{
  status: EngineStatus | null;
  isPreview: boolean;
  onClick?: () => void;
}> = ({ status, isPreview, onClick }) => {
  let pill: {
    status: "live" | "ok" | "idle" | "error";
    label: string;
    title: string;
  };
  if (isPreview) {
    pill = {
      status: "idle",
      label: "Preview: no audio",
      title:
        "Running in a browser with a simulated engine. Launch the desktop app for sound.",
    };
  } else if (!status) {
    pill = {
      status: "idle",
      label: "Audio: …",
      title: "Waiting for the engine",
    };
  } else if (status.mode === "Hardware" && !status.last_error) {
    pill = {
      status: "ok",
      label: `${status.output?.device_name ?? "Audio"} · ${status.sample_rate / 1000} kHz`,
      title: `Output: ${status.output?.device_name}\nInput: ${status.input?.device_name ?? "none"}\nBuffer: ${status.output?.buffer_frames ?? "driver default"} frames`,
    };
  } else if (status.mode === "Hardware") {
    pill = {
      status: "live",
      label: "Audio: warning",
      title: status.last_error ?? "",
    };
  } else {
    pill = {
      status: "error",
      label: "No audio device",
      title: status.last_error ?? "Engine is running headless",
    };
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={pill.title}
      className="cursor-pointer"
    >
      <StatusPill status={pill.status} label={pill.label} />
    </button>
  );
};
