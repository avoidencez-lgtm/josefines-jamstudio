import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { ipc } from "../ipc/client";
import type { ProviderInfo } from "../ipc/contract";
import {
  type AiPreferences,
  BRAINS,
  askBrain,
  listModels,
  useAi,
} from "../lib/jo/providers";
import { openExternal } from "../lib/openUrl";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";
import { Panel } from "./Panel";

const field =
  "min-w-0 w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm";
export function AiSettings() {
  const { preferences, save } = useAi();
  const { keysPresent, setKey, deleteKey, isPreview } = useEngineStore(
    useShallow((s) => ({
      keysPresent: s.keysPresent,
      setKey: s.setKey,
      deleteKey: s.deleteKey,
      isPreview: s.isPreview,
    })),
  );
  const [draft, setDraft] = useState<AiPreferences>(preferences);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerQuery, setProviderQuery] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [models, setModels] = useState<Record<string, string[]>>({});
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
  const local = BRAINS[draft.selected].local;
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
          Choose who helps the studio assistant, Jo and Song Lab. Installed
          agents use their own login and limits. API connections use separate
          billing.
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
              list="available-ai-models"
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
        <datalist id="available-ai-models">
          {(models[draft.selected] ?? [BRAINS[draft.selected].model]).map(
            (id) => (
              <option key={id} value={id} />
            ),
          )}
        </datalist>
        {local ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--fg-1)]">
              Install and sign into the native CLI once. Leave model as
              “default” to use the agent default, or enter a supported model ID.
              Requests run here inside Jamstudio. No subscription token is
              copied into this app. CLI account billing and usage limits apply;
              this does not unlock the general API.
            </p>
            <label>
              Agent executable path (optional)
              <input
                className={field}
                value={model.executable ?? ""}
                onChange={(e) => changeModel({ executable: e.target.value })}
                placeholder="Auto-detect from PATH"
              />
            </label>
            <Button
              disabled={busy || isPreview}
              onClick={() =>
                void run(async () => {
                  const status = await ipc.invoke<{
                    installed: boolean;
                    message: string;
                  }>("agent_status", {
                    provider: draft.selected,
                    executable: model.executable ?? "",
                  });
                  setMessage(status.message);
                })
              }
            >
              Detect installed agent
            </Button>
            <a
              className="underline text-sm"
              href={BRAINS[draft.selected].pricing}
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                void openExternal(BRAINS[draft.selected].pricing);
              }}
            >
              Account and subscription documentation
            </a>
            <p className="text-sm text-[var(--fg-1)]">
              Use a current CLI. The bridge requests structured replies,
              disables shell/MCP tools where supported, and never grants file
              writes. API token limits do not govern local-agent runs. Managed
              CLI policies may still apply.
            </p>
          </div>
        ) : (
          <>
            <Button
              disabled={busy || isPreview || !keysPresent[draft.selected]}
              onClick={() =>
                void run(async () => {
                  const ids = await listModels(draft.selected);
                  setModels((m) => ({ ...m, [draft.selected]: ids }));
                  setMessage(
                    `${ids.length} models loaded. Start typing in Model ID. Listings may include models incompatible with text tools; use Test model before relying on one.`,
                  );
                })
              }
            >
              Load provider models
            </Button>
            <p className="text-sm text-[var(--fg-1)]">
              Model ID stays editable. The catalog shows the first provider page
              (up to 100 for Gemini/Claude); enter another model ID manually if
              absent.
            </p>
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
                Prices are optional and model-specific. Estimates use
                approximate input tokens and the output limit, not the final
                bill. Set spending limits with your provider.{" "}
                <a
                  className="underline"
                  href={BRAINS[draft.selected].pricing}
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    void openExternal(BRAINS[draft.selected].pricing);
                  }}
                >
                  Check current pricing
                </a>
                .
              </p>
            </details>
          </>
        )}
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
            disabled={
              busy || isPreview || (!local && !keysPresent[draft.selected])
            }
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
            {local ? "Test agent (uses account)" : "Test model (API request)"}
          </Button>
        </div>
        <p className="text-sm text-[var(--fg-1)]">
          API models must support text and function calling for Jo. OpenRouter
          sends requests through its service to the selected model provider.
          Audio generation, stem separation and cloud voice are separate
          features.
        </p>
        <details>
          <summary>API keys · stored in the OS keychain</summary>
          <label className="block mt-4">
            Find a connection
            <input
              className={field}
              type="search"
              value={providerQuery}
              onChange={(e) => setProviderQuery(e.target.value)}
              placeholder="Provider name"
            />
          </label>
          <div className="flex flex-col gap-4 mt-4">
            {providers.map((p) => (
              <div
                key={p.id}
                hidden={
                  !`${p.id} ${p.description}`
                    .toLowerCase()
                    .includes(providerQuery.toLowerCase())
                }
              >
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
                    Eleven Music uses this connection in AI Music. Native voice
                    input and spoken Jo replies are not available in this build.
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
