import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { isPreview } from "../../ipc/client";
import { saveRoomPreference } from "../../lib/roomActions";
import { audioProfileSchema, validateAudioProfile } from "../../lib/roomTools";
import { useEngineStore } from "../../store/engine";
import { Button } from "../Button";
import { Field, Status, useTool } from "./shared";

export default function AudioProfilesTool() {
  const e = useEngineStore(
    useShallow((s) => ({
      settings: s.settings,
      refreshDevices: s.refreshDevices,
      applyAudioConfig: s.applyAudioConfig,
    })),
  );
  const { run, message } = useTool();
  const [name, setName] = useState("");
  const parsed = audioProfileSchema.safeParse(e.settings?.audioProfiles ?? []);
  const profiles = parsed.success ? parsed.data : [];
  return (
    <>
      <p>
        Profiles contain device names, channel, sample rate and buffer size.
        They contain no API keys. Saving a duplicate name replaces that profile;
        missing devices must be reconnected before recall.
      </p>
      {!parsed.success && (
        <p role="alert">
          Saved profiles are invalid. Restore them in the settings file before
          editing; they have not been overwritten.
        </p>
      )}
      <div className="room-tool-row">
        <Field label="Name this setup.">
          <input
            maxLength={60}
            placeholder="A home studio."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button
          disabled={!e.settings || !parsed.success}
          onClick={() =>
            void run(async () => {
              const s = useEngineStore.getState().settings;
              if (!s) throw new Error("Load audio settings first.");
              const profile = {
                name: name.trim(),
                config: {
                  input_device: s.input_device ?? null,
                  output_device: s.output_device ?? null,
                  input_channel: s.input_channel,
                  sample_rate: s.sample_rate,
                  buffer_size: s.buffer_size,
                },
              };
              const next = audioProfileSchema.parse([
                ...profiles.filter((p) => p.name !== profile.name),
                profile,
              ]);
              await saveRoomPreference("audioProfiles", next);
              setName("");
              return isPreview
                ? "Profile stored in this preview only."
                : "This audio setup profile is saved.";
            })
          }
        >
          Save this current setup.
        </Button>
      </div>
      <ul className="room-tool-list">
        {profiles.map((p) => (
          <li key={p.name}>
            <div>
              <strong>{p.name}</strong>
              <p>
                {p.config.input_device
                  ? `Input is ${p.config.input_device}.`
                  : "This is the default input."}{" "}
                {p.config.output_device
                  ? `Output is ${p.config.output_device}.`
                  : "This is the default output."}{" "}
                Channel is {p.config.input_channel + 1}. {p.config.sample_rate}{" "}
                Hz. {p.config.buffer_size} frames.
              </p>
            </div>
            <div className="room-tool-row">
              <Button
                disabled={isPreview}
                onClick={() =>
                  void run(async () => {
                    await e.refreshDevices();
                    validateAudioProfile(
                      p.config,
                      useEngineStore.getState().devices,
                    );
                    const status = await e.applyAudioConfig(p.config);
                    if (!status || status.last_error || !status.running)
                      throw new Error(
                        status?.last_error ??
                          "The audio engine did not start. Inspect audio settings below.",
                      );
                    return "Profile applied. Check the input meter before recording.";
                  })
                }
              >
                Recall this {p.name}.
              </Button>
              <Button
                aria-label={`Remove this profile ${p.name}.`}
                onClick={() =>
                  void run(async () => {
                    await saveRoomPreference(
                      "audioProfiles",
                      profiles.filter((row) => row.name !== p.name),
                    );
                    return "Profile removed; current audio settings are unchanged.";
                  })
                }
              >
                Remove this profile.
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Status text={message} />
    </>
  );
}
