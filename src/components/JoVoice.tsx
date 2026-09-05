import { useEffect, useState } from "react";
import { z } from "zod";
import { ipc, isPreview } from "../ipc/client";
import type { AppSettings, AudioDevices } from "../ipc/contract";
import { handleJoQuery, useJoConversation } from "../lib/jo/conversation";
import {
  cancelVoice,
  releaseVoice,
  setVoiceShortcut,
  startVoice,
  useVoice,
} from "../lib/jo/voice";
import { openAiSettings } from "../lib/settingsView";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";

const configSchema = z
  .object({
    microphone: z.string().nullable().default(null),
    voiceId: z.string().max(100).default(""),
    duckDb: z.number().min(-24).max(0).default(-9),
    shortcut: z.string().max(100).default("CommandOrControl+Shift+J"),
  })
  .passthrough();
type VoiceConfig = z.infer<typeof configSchema>;
const labels = {
  idle: "Ready",
  opening: "Opening microphone…",
  cancelling: "Stopping microphone…",
  listening: "Listening, release to send",
  transcribing: "Transcribing…",
  thinking: "Jo is thinking…",
  synthesizing: "Preparing Jo's voice…",
  speaking: "Jo is speaking",
};

export function JoVoice() {
  const { phase, shortcut } = useVoice();
  const hasKey = useEngineStore((s) => Boolean(s.keysPresent.elevenlabs));
  const [draft, setDraft] = useState<VoiceConfig>(configSchema.parse({}));
  const [saved, setSaved] = useState<VoiceConfig | null>(null);
  const [inputs, setInputs] = useState<string[]>([]);
  const [voices, setVoices] = useState<{ voice_id: string; name: string }[]>(
    [],
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.all([
      ipc.invoke<AppSettings>("settings_get"),
      ipc.invoke<AudioDevices>("audio_list_devices"),
    ])
      .then(([settings, devices]) => {
        if (!mounted) return;
        const voice = configSchema.parse(settings.voice ?? {});
        setDraft(voice);
        setSaved(voice);
        setInputs(devices.inputs.map((d) => d.name));
      })
      .catch((e) => {
        if (mounted) setMessage(String(e));
      });
    return () => {
      mounted = false;
    };
  }, []);
  const active = phase !== "idle";
  const run = async (operation: () => Promise<void>) => {
    setSaving(true);
    setMessage("");
    try {
      await operation();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="flex flex-col gap-3" aria-label="Jo voice">
      <JoVoiceControls disabled={!saved?.voiceId || saving} />
      <p className="text-sm text-[var(--fg-1)]">
        Hold the button, Space or Enter while focused. Release to send up to 20
        seconds to ElevenLabs. A new press interrupts Jo. Provider charges
        apply.
      </p>
      <details>
        <summary className="cursor-pointer text-sm">Voice setup</summary>
        <div className="flex flex-wrap items-end gap-3 py-3">
          <label className="room-tool-field">
            Microphone
            <select
              value={draft.microphone ?? ""}
              disabled={active || saving}
              onChange={(e) =>
                setDraft({ ...draft, microphone: e.target.value || null })
              }
            >
              <option value="">System default microphone</option>
              {inputs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="room-tool-field">
            ElevenLabs voice ID
            <input
              list="jo-voice-options"
              value={draft.voiceId}
              disabled={active || saving}
              maxLength={100}
              onChange={(e) => setDraft({ ...draft, voiceId: e.target.value })}
            />
            <datalist id="jo-voice-options">
              {voices.map((voice) => (
                <option key={voice.voice_id} value={voice.voice_id}>
                  {voice.name}
                </option>
              ))}
            </datalist>
          </label>
          <Button
            type="button"
            disabled={isPreview || !hasKey || active || saving}
            onClick={() =>
              void run(async () => {
                const response = await ipc.invoke<{
                  status: number;
                  body: string;
                }>("provider_fetch", {
                  request: {
                    provider: "elevenlabs",
                    path: "/v2/voices?page_size=100",
                    method: "GET",
                    headers: {},
                    body: null,
                  },
                });
                if (response.status !== 200)
                  throw new Error(
                    `Could not load voices (HTTP ${response.status}). Check your API key.`,
                  );
                const data = z
                  .object({
                    voices: z.array(
                      z.object({ voice_id: z.string(), name: z.string() }),
                    ),
                    has_more: z.boolean().optional(),
                  })
                  .parse(JSON.parse(response.body));
                setVoices(data.voices);
                setMessage(
                  data.has_more
                    ? "First 100 voices loaded. You can also paste another voice ID."
                    : `${data.voices.length} voices loaded. Choose an ID and save.`,
                );
              })
            }
          >
            Load voices
          </Button>
          <label className="room-tool-field">
            Band ducking (dB)
            <select
              value={draft.duckDb}
              disabled={active || saving}
              onChange={(e) =>
                setDraft({ ...draft, duckDb: Number(e.target.value) })
              }
            >
              {[-18, -12, -9, -6, 0].map((db) => (
                <option key={db} value={db}>
                  {db} dB
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={isPreview || active || saving || !draft.voiceId.trim()}
            onClick={() =>
              void run(async () => {
                if (!/^[\w-]{1,100}$/.test(draft.voiceId))
                  throw new Error("Enter a valid ElevenLabs voice ID.");
                const settings = await ipc.invoke<AppSettings>("settings_get");
                const voice = configSchema.parse(draft);
                await ipc.invoke("settings_set", {
                  settings: { ...settings, voice },
                });
                setSaved(voice);
                setMessage("Voice settings saved.");
              })
            }
          >
            Save voice setup
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 py-3">
          <label className="room-tool-field">
            Global hold shortcut
            <input
              value={draft.shortcut}
              maxLength={100}
              disabled={active || saving || Boolean(shortcut)}
              onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })}
            />
          </label>
          <Button
            disabled={
              isPreview ||
              saving ||
              (!shortcut && (active || !hasKey || !saved?.voiceId))
            }
            onClick={() =>
              void run(async () => {
                if (shortcut) await cancelVoice();
                await setVoiceShortcut(shortcut ? null : draft.shortcut);
              })
            }
          >
            {shortcut
              ? "Disable global shortcut"
              : "Enable shortcut for this session"}
          </Button>
        </div>
        <p className="text-sm text-[var(--fg-1)]">
          {shortcut ? `Active: ${shortcut}. ` : "Shortcut is off. "}When
          enabled, hold it in any app and release to send microphone audio to
          ElevenLabs. Save voice setup to remember the combination; enabling is
          session-only. In Write → Hands-free controls, learn Talk / send to Jo
          for a two-press pedal.
        </p>
        {message && (
          <output className="text-sm text-[var(--fg-1)]">{message}</output>
        )}
      </details>
    </section>
  );
}

export function JoVoiceControls({
  disabled = false,
  compact = false,
}: { disabled?: boolean; compact?: boolean }) {
  const { phase, error } = useVoice();
  const hasKey = useEngineStore((s) => Boolean(s.keysPresent.elevenlabs));
  const busy = useJoConversation((s) => s.busy);
  const ready = !isPreview && hasKey && !busy && !disabled;
  const active = phase !== "idle";
  if (compact && isPreview) return null;
  if (compact && !hasKey)
    return (
      <Button
        size="sm"
        onClick={() => useEngineStore.getState().setScreen("jo")}
      >
        Set up Jo voice
      </Button>
    );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size={compact ? "sm" : "lg"}
          variant={phase === "listening" ? "danger" : "secondary"}
          disabled={
            !ready ||
            !["idle", "opening", "listening", "speaking"].includes(phase)
          }
          aria-pressed={phase === "listening"}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            void startVoice(handleJoQuery);
          }}
          onPointerUp={() => void releaseVoice(handleJoQuery)}
          onPointerCancel={() => void cancelVoice()}
          onKeyDown={(event) => {
            if ([" ", "Enter"].includes(event.key)) {
              event.preventDefault();
              if (!event.repeat) void startVoice(handleJoQuery);
            }
          }}
          onKeyUp={(event) => {
            if ([" ", "Enter"].includes(event.key)) {
              event.preventDefault();
              void releaseVoice(handleJoQuery);
            }
          }}
          onBlur={() => {
            if (["opening", "listening"].includes(useVoice.getState().phase))
              void cancelVoice();
          }}
        >
          {phase === "listening" ? "Release to send" : "Hold to talk"}
        </Button>
        {active && (
          <Button type="button" onClick={() => void cancelVoice()}>
            Cancel voice
          </Button>
        )}
        {(!compact || active) && (
          <output className="text-sm text-[var(--fg-1)]">
            {isPreview
              ? "Voice requires the desktop app"
              : !hasKey
                ? "Add an ElevenLabs key to enable voice"
                : labels[phase]}
          </output>
        )}
        {!hasKey && (
          <Button type="button" onClick={openAiSettings}>
            API key settings
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="max-w-xl text-sm text-[var(--record)]">
          {error}
        </p>
      )}
    </div>
  );
}
