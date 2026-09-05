import { isPreview } from "../ipc/client";
import {
  PEDAL_ACTIONS,
  type PedalAction,
  describePress,
  useController,
} from "../lib/controller";
import { cancelVoice } from "../lib/jo/voice";
import { Button } from "./Button";

export function FootControls() {
  const c = useController();
  return (
    <details className="song-foot-controls">
      <summary>Hands-free controls · {c.enabled ? "enabled" : "off"}</summary>
      <p className="song-help">
        Keep playing while a pedal saves the idea, starts a take or loops a
        section. Select a MIDI input, click Learn, then press the pedal. Each
        press has one action. Talk / send to Jo uses one press to start
        listening and another to send; a press while waiting cancels. Voice
        setup is in Jo AI and provider charges apply. The microphone stops after
        20 seconds.
      </p>
      <div className="song-controls">
        <label>
          MIDI input
          <select
            value={c.port}
            disabled={c.busy || isPreview}
            onChange={(e) => void c.connect(e.target.value)}
          >
            <option value="">Disconnected</option>
            {[...new Set([...c.ports, ...(c.port ? [c.port] : [])])].map(
              (p) => (
                <option key={p}>{p}</option>
              ),
            )}
          </select>
        </label>
        <Button disabled={c.busy || isPreview} onClick={() => void c.refresh()}>
          Rescan inputs
        </Button>
        <label className="song-check">
          <input
            type="checkbox"
            checked={c.enabled}
            disabled={!c.port || c.busy}
            onChange={(e) => {
              if (!e.target.checked) void cancelVoice();
              useController.setState({
                enabled: e.target.checked,
                learning: null,
              });
            }}
          />
          Enable pedal actions
        </label>
      </div>
      <div className="song-pedal-grid">
        {Object.entries(PEDAL_ACTIONS).map(([key, label]) => {
          const action = key as PedalAction;
          const binding = c.config.bindings.find((b) => b.action === action);
          return (
            <div className="song-pedal-row" key={key}>
              <strong>{label}</strong>
              <span>
                {binding ? describePress(binding.press) : "Unassigned"}
              </span>
              <Button
                disabled={!c.port || c.busy}
                onClick={() =>
                  useController.setState({
                    learning: c.learning === action ? null : action,
                    message:
                      "Press the pedal once. Learning does not run its action.",
                  })
                }
              >
                {c.learning === action ? "Cancel learning" : "Learn"}
              </Button>
              <Button
                disabled={!binding || c.busy}
                onClick={() => void c.remove(action)}
              >
                Clear
              </Button>
            </div>
          );
        })}
      </div>
      <output className="song-help">{c.message}</output>
      <p className="song-help">
        HeadRush Pedalboard sends Program Changes from its 5-pin MIDI Out when
        rigs change; connect that through a MIDI interface. A dedicated CC/note
        controller also works. Actions stay off after restarting until you
        connect and enable them. PC numbers use 0–127. CC pedals trigger when
        crossing 64; release before pressing again.
      </p>
    </details>
  );
}
