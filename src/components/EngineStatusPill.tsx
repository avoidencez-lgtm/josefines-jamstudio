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
      label: "This preview has no audio.",
      title:
        "Running in a browser with a simulated engine. Launch the desktop app for sound.",
    };
  } else if (!status) {
    pill = {
      status: "idle",
      label: "Waiting for the audio.",
      title: "Waiting for the engine.",
    };
  } else if (status.mode === "Hardware" && !status.last_error) {
    pill = {
      status: "ok",
      label: `${status.output?.device_name ? `${status.output.device_name}.` : "This audio is unnamed."} ${status.sample_rate / 1000} kHz.`,
      title: `${status.output?.device_name ? `Output is ${status.output.device_name}.` : "This output is unnamed."} ${status.input?.device_name ? `Input is ${status.input.device_name}.` : "This input is not connected."} ${status.output?.buffer_frames != null ? `Buffer is ${status.output.buffer_frames} frames.` : "This buffer is the driver default."}`,
    };
  } else if (status.mode === "Hardware") {
    pill = {
      status: "live",
      label: "Audio has a warning.",
      title: status.last_error ?? "",
    };
  } else {
    pill = {
      status: "error",
      label: "There is no audio device.",
      title: status.last_error ?? "The engine is running headless.",
    };
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={pill.title}
      aria-label={pill.label}
      className="cursor-pointer"
    >
      <StatusPill status={pill.status} label={pill.label} />
    </button>
  );
};
