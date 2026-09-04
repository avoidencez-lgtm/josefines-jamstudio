import type React from "react";
import { useState } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { useEngineStore } from "../store/engine";

export const AiMusic: React.FC = () => {
  const {
    aiMusic,
    startAiMusic,
    stopAiMusic,
    steerAiMusic,
    setAiMusicVolume,
    keysPresent,
  } = useEngineStore();

  const [prompt, setPrompt] = useState(aiMusic.currentPrompt);
  const [provider, setProvider] = useState(aiMusic.provider);
  const [deltaText, setDeltaText] = useState("");

  const suggestionPrompts = [
    "Neo-soul groove with rhodes and pocket drums",
    "Desert stoner rock fuzz riff with heavy cymbals",
    "Cinematic ambient post-rock swell",
    "Upbeat funk vamp with slap bass and brass hits",
  ];

  const handleStart = async () => {
    await startAiMusic({
      provider,
      prompt,
      mixVolume: aiMusic.mixVolume,
    });
  };

  const handleSteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deltaText.trim()) return;
    await steerAiMusic(deltaText);
    setDeltaText("");
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
              Generative AI Music Streaming
            </h1>
            <StatusPill
              status={aiMusic.active ? "live" : "idle"}
              label={aiMusic.active ? "Streaming Audio" : "Not built yet"}
            />
          </div>
          <p className="text-xs font-mono text-[var(--fg-2)] mt-0.5">
            Planned: prompt-steered backing over Google Lyria RealTime or
            ElevenLabs Music, mixed under the band.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {aiMusic.active ? (
            <Button size="md" variant="danger" onClick={stopAiMusic}>
              Stop Stream
            </Button>
          ) : (
            <Button size="md" variant="primary" onClick={handleStart}>
              Start Stream
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 rounded-[var(--radius-m)] border border-amber-500/40 bg-amber-950/20 text-xs font-mono text-amber-200 space-y-1">
        <p className="font-semibold">
          This screen is a placeholder for milestone M4.
        </p>
        <p className="text-amber-200/80">
          No provider is connected and nothing here reaches the speakers yet.
          Starting a stream returns an honest error. The API-key plumbing and
          the allow-listed network proxy on the Settings screen are real and are
          what this screen will use once the Lyria RealTime websocket is built.
        </p>
      </div>

      <Panel title="Stream Configuration (intended layout)">
        <div className="space-y-4">
          <div>
            <div className="text-xs font-mono text-[var(--fg-2)] uppercase block mb-1.5">
              Provider Engine
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setProvider("offline-synthetic")}
                className={`p-3 rounded border text-left text-xs font-mono transition-colors ${
                  provider === "offline-synthetic"
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg-0)]"
                    : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--fg-2)]"
                }`}
              >
                <div className="font-bold">Offline Synthetic</div>
                <div className="text-[10px] text-[var(--fg-2)] mt-0.5">
                  Procedural, zero-latency
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProvider("lyria-realtime")}
                className={`p-3 rounded border text-left text-xs font-mono transition-colors ${
                  provider === "lyria-realtime"
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg-0)]"
                    : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--fg-2)]"
                }`}
              >
                <div className="font-bold">Google Lyria RealTime</div>
                <div className="text-[10px] text-[var(--fg-2)] mt-0.5">
                  {keysPresent.gemini
                    ? "Key configured"
                    : "Keychain key required"}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProvider("elevenlabs-music")}
                className={`p-3 rounded border text-left text-xs font-mono transition-colors ${
                  provider === "elevenlabs-music"
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg-0)]"
                    : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--fg-2)]"
                }`}
              >
                <div className="font-bold">ElevenLabs Music</div>
                <div className="text-[10px] text-[var(--fg-2)] mt-0.5">
                  {keysPresent.elevenlabs
                    ? "Key configured"
                    : "Keychain key required"}
                </div>
              </button>
            </div>
          </div>

          {/* Prompt Area */}
          <div>
            <label
              htmlFor="ai-prompt-input"
              className="text-xs font-mono text-[var(--fg-2)] uppercase block mb-1.5"
            >
              Generative Musical Prompt
            </label>
            <textarea
              id="ai-prompt-input"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-3 rounded-[var(--radius-m)] text-xs font-mono focus:outline-none focus:border-[var(--accent)]"
              placeholder="Describe the rhythm, vibe, instruments, and feel..."
            />

            {/* Suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {suggestionPrompts.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setPrompt(s)}
                  className="text-[10px] font-mono px-2 py-1 rounded bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Mix Volume Slider */}
          <div className="pt-2 flex items-center gap-4">
            <span className="text-xs uppercase font-mono text-[var(--fg-2)] w-24">
              Mix Volume
            </span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={aiMusic.mixVolume}
              onChange={(e) =>
                setAiMusicVolume(Number.parseFloat(e.target.value))
              }
              className="flex-1 accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-xs font-mono text-[var(--fg-0)] tabular-nums w-12 text-right">
              {(aiMusic.mixVolume * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </Panel>

      {/* Live Steering Panel */}
      <Panel title="Live Stream Steering">
        <div className="space-y-3">
          <p className="text-xs font-mono text-[var(--fg-2)]">
            Steer the live AI stream on the fly. Add subtle shifts in feel,
            tempo, or instrumentation without restarting the stream.
          </p>

          <form onSubmit={handleSteer} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. 'add subtle wah guitar', 'drop the tempo slightly', 'heavy cymbals'..."
              value={deltaText}
              disabled={!aiMusic.active}
              onChange={(e) => setDeltaText(e.target.value)}
              className="flex-1 bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-3 py-2 rounded-[var(--radius-m)] text-xs font-mono focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
            />
            <Button
              type="submit"
              size="md"
              variant="secondary"
              disabled={!aiMusic.active || !deltaText.trim()}
            >
              Steer Stream
            </Button>
          </form>

          {aiMusic.promptDelta && (
            <div className="p-2.5 bg-[var(--bg-2)] rounded border border-[var(--line)] flex items-center justify-between text-xs font-mono">
              <span className="text-[var(--fg-2)]">
                Active Steering Modulation:
              </span>
              <span className="text-[var(--accent)] font-semibold">
                {aiMusic.promptDelta}
              </span>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
};
