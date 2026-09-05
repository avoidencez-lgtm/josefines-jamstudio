import { useEffect, useState } from "react";
import { z } from "zod";
import { ipc, isPreview } from "../ipc/client";
import type { AppSettings, AudioDevices } from "../ipc/contract";
import {
  type VoiceQuery,
  cancelVoice,
  releaseVoice,
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

export function JoVoice({ query, busy }: { query: VoiceQuery; busy: boolean }) {
  const { phase, error } = useVoice();
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
    const stopOnBlur = () => {
      if (["opening", "listening"].includes(useVoice.getState().phase))
        void cancelVoice();
    };
    window.addEventListener("blur", stopOnBlur);
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
      window.removeEventListener("blur", stopOnBlur);
      if (!isPreview) void cancelVoice();
    };
  }, []);
  const active = phase !== "idle";
  const ready =
    !isPreview && hasKey && Boolean(saved?.voiceId) && !busy && !saving;
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
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          variant={phase === "listening" ? "danger" : "secondary"}
          disabled={
            !ready ||
            !["idle", "opening", "listening", "speaking"].includes(phase)
          }
          aria-pressed={phase === "listening"}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            void startVoice(query);
          }}
          onPointerUp={() => void releaseVoice(query)}
          onPointerCancel={() => void cancelVoice()}
          onKeyDown={(event) => {
            if ([" ", "Enter"].includes(event.key)) {
              event.preventDefault();
              if (!event.repeat) void startVoice(query);
            }
          }}
          onKeyUp={(event) => {
            if ([" ", "Enter"].includes(event.key)) {
              event.preventDefault();
              void releaseVoice(query);
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
        <output className="text-sm text-[var(--fg-1)]">
          {isPreview
            ? "Voice requires the desktop app"
            : !hasKey
              ? "Add an ElevenLabs key to enable voice"
              : !saved?.voiceId
                ? "Choose a voice below"
                : labels[phase]}
        </output>
        {!hasKey && (
          <Button type="button" onClick={openAiSettings}>
            API key settings
          </Button>
        )}
      </div>
      <p className="text-sm text-[var(--fg-1)]">
        Hold the button, Space or Enter while focused. Release to send up to 20
        seconds to ElevenLabs. A new press interrupts Jo. Provider charges
        apply.
      </p>
      {error && (
        <p role="alert" className="text-sm text-[var(--record)]">
          {error}
        </p>
      )}
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
        {message && (
          <output className="text-sm text-[var(--fg-1)]">{message}</output>
        )}
      </details>
    </section>
  );
}
