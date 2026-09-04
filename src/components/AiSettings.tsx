import { useEffect, useState } from "react";
import { ipc } from "../ipc/client";
import type { ProviderInfo } from "../ipc/contract";
import {
  type AiPreferences,
  BRAINS,
  askBrain,
  useAi,
} from "../lib/jo/providers";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";
import { Panel } from "./Panel";

const field =
  "min-w-0 w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm";
export function AiSettings() {
  const { preferences, save } = useAi();
  const { keysPresent, setKey, deleteKey, isPreview } = useEngineStore();
  const [draft, setDraft] = useState<AiPreferences>(preferences);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setDraft(preferences), [preferences]);
  useEffect(() => {
    void ipc
      .invoke<ProviderInfo[]>("providers_list")
      .then(setProviders)
      .catch((e) => setMessage(String(e)));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };
  const model = draft.models[draft.selected];
  const changeModel = (patch: Partial<typeof model>) =>
    setDraft((p) => ({
      ...p,
      models: {
        ...p.models,
        [p.selected]: { ...p.models[p.selected], ...patch },
      },
    }));
  return (
    <Panel title="AI providers & Song Lab">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-[var(--fg-1)]">
          Choose who helps Jo and Song Lab. Each request uses only the selected
          provider. API billing is separate from chat subscriptions.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            Provider
            <select
              className={field}
              value={draft.selected}
              disabled={busy}
              onChange={(e) =>
                setDraft((p) => ({ ...p, selected: e.target.value }))
              }
            >
              {Object.entries(BRAINS).map(([id, b]) => (
                <option key={id} value={id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model ID
            <input
              className={field}
              value={model.model}
              disabled={busy}
              onChange={(e) =>
                changeModel({
                  model: e.target.value,
                  inputPrice: null,
                  outputPrice: null,
                })
              }
            />
          </label>
        </div>
        <details>
          <summary>Response limits and cost estimate</summary>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            <label>
              Maximum output tokens
              <input
                className={field}
                type="number"
                min={256}
                max={4096}
                step={256}
                value={model.maxTokens}
                onChange={(e) =>
                  changeModel({ maxTokens: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Input USD / million tokens
              <input
                className={field}
                type="number"
                min={0}
                step="any"
                value={model.inputPrice ?? ""}
                placeholder="Unknown"
                onChange={(e) =>
                  changeModel({
                    inputPrice:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Output USD / million tokens
              <input
                className={field}
                type="number"
                min={0}
                step="any"
                value={model.outputPrice ?? ""}
                placeholder="Unknown"
                onChange={(e) =>
                  changeModel({
                    outputPrice:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="text-sm text-[var(--fg-1)] mt-3">
            Prices are optional and model-specific. Estimates use approximate
            input tokens and the output limit, not the final bill. Set spending
            limits with your provider.{" "}
            <a
              className="underline"
              href={BRAINS[draft.selected].pricing}
              target="_blank"
              rel="noreferrer"
            >
              Check current pricing
            </a>
            .
          </p>
        </details>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await save(draft);
                setMessage(
                  isPreview
                    ? "Saved for this preview session. Cloud requests require the desktop app."
                    : "AI settings saved.",
                );
              })
            }
          >
            Save AI settings
          </Button>
          <Button
            disabled={busy || isPreview || !keysPresent[draft.selected]}
            onClick={() =>
              void run(async () => {
                const reply = await askBrain(
                  {
                    system:
                      "Connection test. Reply with Ready. Do not use tools.",
                    messages: [{ role: "user", content: "Check connection." }],
                    tools: true,
                  },
                  draft,
                );
                setMessage(
                  `${BRAINS[draft.selected].name} responded: ${reply.reply}`,
                );
              })
            }
          >
            Test model (API request)
          </Button>
        </div>
        <p className="text-sm text-[var(--fg-1)]">
          Custom models must support text and function calling for Jo.
          OpenRouter sends requests through its service to the selected model
          provider. Audio generation, stem separation and cloud voice are
          separate features.
        </p>
        <details>
          <summary>API keys · stored in the OS keychain</summary>
          <div className="flex flex-col gap-4 mt-4">
            {providers.map((p) => (
              <div key={p.id}>
                <label htmlFor={`key-${p.id}`}>
                  {BRAINS[p.id]?.name ?? p.description} ·{" "}
                  {keysPresent[p.id] ? "Key saved" : "No key"}
                </label>
                <div className="flex flex-wrap sm:flex-nowrap gap-2 mt-1">
                  <input
                    id={`key-${p.id}`}
                    className={field}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={keys[p.id] ?? ""}
                    disabled={busy || isPreview}
                    placeholder="Paste a key to save or replace"
                    onChange={(e) =>
                      setKeys((k) => ({ ...k, [p.id]: e.target.value }))
                    }
                  />
                  <Button
                    disabled={busy || isPreview || !keys[p.id]?.trim()}
                    onClick={() =>
                      void run(async () => {
                        await setKey(p.id, keys[p.id].trim());
                        setKeys((k) => ({ ...k, [p.id]: "" }));
                        setMessage("Key saved in the OS keychain.");
                      })
                    }
                  >
                    Save key
                  </Button>
                  <Button
                    disabled={busy || isPreview || !keysPresent[p.id]}
                    onClick={() =>
                      void run(async () => {
                        await deleteKey(p.id);
                        setMessage("Key removed.");
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
                {p.id === "elevenlabs" && (
                  <p className="text-sm text-[var(--fg-1)]">
                    Credential storage only; ElevenLabs cloud audio is not
                    connected yet.
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
        <p className="text-sm text-[var(--fg-1)]">
          Keys are entered here, then stored in the keychain. Saved keys are
          never read back into the UI. Rust attaches them to requests; the usage
          log contains metadata, never prompts or song contents.
        </p>
        {message && (
          <output
            className="text-sm whitespace-pre-wrap break-words"
            aria-live="polite"
          >
            {message}
          </output>
        )}
      </div>
    </Panel>
  );
}
