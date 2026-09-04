import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { FootControls } from "../components/FootControls";
import { SongLab } from "../components/SongLab";
import {
  ArrangementDesk,
  EnergyDesk,
  HarmonyDesk,
  LyricsDesk,
} from "../components/WritingDesk";
import { ipc, isPreview } from "../ipc/client";
import { transposeChart } from "../lib/chart/transpose";
import { PARTS, changeGroove, fitTempo, useWriting } from "../lib/originals";
import { useEngineStore } from "../store/engine";
import "./originals.css";

export function Originals() {
  const w = useWriting();
  const {
    styles,
    takes,
    isRecording,
    loadTakes,
    loadLibrary,
    exportTakeDaw,
    transportStop,
    rigState,
    loadRigProfiles,
  } = useEngineStore();
  const [versionName, setVersionName] = useState("");
  const [captureLength, setCaptureLength] = useState(30);
  const [fitBars, setFitBars] = useState(4);
  const song = w.song;
  const section =
    song?.body.chart.sections.find((s) => s.id === w.selected) ??
    song?.body.chart.sections[0];
  const band = section && song?.body.sections[section.id];
  useEffect(() => {
    if (section && section.id !== w.selected) w.select(section.id);
  }, [section, w.selected, w.select]);
  useEffect(() => {
    void w.action(async () => {
      await w.refresh();
      await loadTakes();
      await loadLibrary();
      await loadRigProfiles();
    });
  }, [w.action, w.refresh, loadTakes, loadLibrary, loadRigProfiles]);
  const run = (fn: () => Promise<void>) => w.action(fn);
  const favourite = async (id: string, on: boolean) => {
    await ipc.invoke("takes_favourite", { takeId: id, favourite: on });
    await loadTakes();
  };

  return (
    <div className="song-editor">
      <header className="song-heading">
        <div className="write-identity">
          <h1>Write</h1>
          {song && (
            <label className="song-title">
              Song name
              <input
                value={song.body.chart.name}
                maxLength={120}
                disabled={w.busy || isRecording}
                onChange={(e) =>
                  w.edit((b) => {
                    b.chart.name = e.target.value;
                  })
                }
              />
            </label>
          )}
        </div>
        <div className="song-actions">
          <label>
            Open song
            <select
              aria-label="Open song"
              value={song?.revision ? song.id : ""}
              disabled={w.busy || isRecording}
              onChange={(e) => {
                const s = w.saved.find((s) => s.id === e.target.value);
                if (s) w.openSong(s);
              }}
            >
              <option value="">Choose a saved song</option>
              {w.saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.body.chart.name}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={w.createSong} disabled={w.busy || isRecording}>
            New song
          </Button>
        </div>
      </header>
      {w.message && (
        <output aria-live="polite" className="song-message">
          {w.message}
        </output>
      )}
      {!song ? (
        <section className="song-empty">
          <h2>Start with your own idea</h2>
          <p>
            Create a song, then use Record & layers to capture a riff. You can
            add a recorded idea whenever you are ready.
          </p>
          <Button variant="primary" onClick={w.createSong}>
            Create a song
          </Button>
        </section>
      ) : (
        <>
          <div className="song-toolbar">
            <span className="song-save-state">
              {w.dirty ? "Unsaved changes" : "Saved"}
            </span>
            <Button
              disabled={w.busy || isRecording}
              hidden={w.view !== "versions"}
              onClick={() => run(w.saveCopy)}
            >
              Save copy
            </Button>
            <Button
              disabled={!w.past.length || w.busy || isRecording}
              onClick={w.undo}
            >
              Undo
            </Button>
            <Button
              disabled={!w.future.length || w.busy || isRecording}
              onClick={w.redo}
            >
              Redo
            </Button>
            <Button
              disabled={w.busy || isRecording}
              onClick={() => run(w.save)}
            >
              Save song
            </Button>
            <Button
              variant="primary"
              disabled={w.busy || isRecording || isPreview}
              title="Load the current song edits and play from the beginning"
              onClick={() => run(w.play)}
            >
              Play song
            </Button>
            <Button
              disabled={w.busy || isRecording || isPreview}
              onClick={() => run(() => w.rehearse())}
            >
              Loop section
            </Button>
            <Button
              disabled={w.busy || isRecording || isPreview}
              hidden={w.view !== "record"}
              onClick={() => run(() => w.rehearse(true))}
            >
              Next section
            </Button>
            <Button
              disabled={w.busy || isRecording}
              onClick={() => run(transportStop)}
            >
              Stop
            </Button>
            <Button
              variant={isRecording ? "danger" : "secondary"}
              disabled={w.busy || isPreview}
              title="Starts at bar 1, playing guitar layers while recording a new take"
              onClick={() => run(w.record)}
            >
              {isRecording ? "Save take" : "Record"}
            </Button>
          </div>
          <div className="write-navigation">
            <nav className="write-views" aria-label="Writing views">
              {(
                [
                  ["compose", "Compose"],
                  ["lyrics", "Lyrics"],
                  ["record", "Record & layers"],
                  ["versions", "Versions"],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-current={w.view === id ? "page" : undefined}
                  onClick={() => useWriting.setState({ view: id })}
                >
                  {label}
                </button>
              ))}
            </nav>{" "}
            <fieldset
              title="Key transposes chords. Mode changes only the harmony palette. Recorded guitar retains pitch and speed."
              className="write-key-settings"
              disabled={w.busy || isRecording}
            >
              <NumberField
                label="Tempo (BPM)"
                value={song.body.chart.defaultBpm}
                min={40}
                max={240}
                step={0.01}
                change={(v) =>
                  w.edit((b) => {
                    b.chart.defaultBpm = v;
                  })
                }
              />
              <label>
                Key
                <select
                  value={song.body.chart.keyTonic}
                  onChange={(e) =>
                    w.edit((b) => {
                      b.chart = transposeChart(
                        b.chart,
                        Number(e.target.value) - b.chart.keyTonic,
                      );
                    })
                  }
                >
                  {[
                    "C",
                    "C#",
                    "D",
                    "Eb",
                    "E",
                    "F",
                    "F#",
                    "G",
                    "Ab",
                    "A",
                    "Bb",
                    "B",
                  ].map((k, i) => (
                    <option key={k} value={i}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mode
                <select
                  value={song.body.chart.mode}
                  onChange={(e) =>
                    w.edit((b) => {
                      b.chart.mode = e.target.value as "major" | "minor";
                    })
                  }
                >
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                </select>
              </label>
            </fieldset>
          </div>
          <fieldset disabled={w.busy || isRecording} className="song-workspace">
            <legend className="sr-only">Song settings</legend>
            <ArrangementDesk />
            <div hidden={w.view !== "lyrics"}>
              <LyricsDesk />
            </div>
            <div hidden={w.view !== "compose"}>
              <HarmonyDesk key={`${song.id}-${section?.id}`} />
            </div>
            {section && band && (
              <details
                className="song-detail write-disclosure"
                hidden={w.view !== "compose"}
              >
                <summary>Band, groove and section settings</summary>
                <div className="song-section-heading">
                  <h2>Edit section</h2>
                  <label>
                    Section name
                    <input
                      value={section.name}
                      maxLength={80}
                      onChange={(e) =>
                        w.edit((b) => {
                          const s = b.chart.sections.find(
                            (s) => s.id === section.id,
                          );
                          if (s) s.name = e.target.value;
                        })
                      }
                    />
                  </label>
                </div>
                <div className="song-controls">
                  <label className="song-check">
                    <input
                      type="checkbox"
                      checked={Boolean(song.body.toneProfileId)}
                      disabled={!rigState?.currentProfile}
                      onChange={(e) =>
                        w.edit((b) => {
                          b.toneProfileId = e.target.checked
                            ? rigState?.currentProfile.id
                            : null;
                        })
                      }
                    />
                    Let this song change my rig tones
                  </label>
                  <span className="song-help">
                    {song.body.toneProfileId ||
                      rigState?.currentProfile.name ||
                      "Choose a rig profile"}{" "}
                    · MIDI output is selected in Rig.
                  </span>
                </div>
                {song.body.toneProfileId && (
                  <label>
                    Tone on section entry
                    <select
                      aria-label="Tone on section entry"
                      disabled={
                        song.body.toneProfileId !== rigState?.currentProfile.id
                      }
                      value={band.rigScene ?? ""}
                      onChange={(e) =>
                        w.edit((b) => {
                          b.sections[section.id].rigScene =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value);
                        })
                      }
                    >
                      <option value="">Keep current tone</option>
                      {rigState?.currentProfile.scenes.map((s, i) => (
                        <option key={s.name} value={i}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <EnergyDesk />
                <div className="song-controls">
                  <label>
                    Try a groove
                    <select
                      aria-label="Try a groove for unlocked parts"
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          w.edit((b) => {
                            b.sections[section.id] = changeGroove(
                              b.sections[section.id],
                              e.target.value,
                            );
                          });
                      }}
                    >
                      <option value="">Change unlocked parts</option>
                      {styles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberField
                    label="Swing (%)"
                    value={Math.round(band.swing * 100)}
                    min={50}
                    max={75}
                    change={(v) =>
                      w.edit((b) => {
                        b.sections[section.id].swing = v / 100;
                      })
                    }
                  />
                </div>
                <div className="song-parts">
                  {PARTS.map((name, i) => {
                    const p = band.parts[i];
                    return (
                      <div className="song-part" key={name}>
                        <strong>{name}</strong>
                        <label>
                          Groove
                          <select
                            value={p.styleId}
                            onChange={(e) =>
                              w.edit((b) => {
                                b.sections[section.id].parts[i].styleId =
                                  e.target.value;
                              })
                            }
                          >
                            {styles.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Intensity {Math.round(p.intensity * 100)}%
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(p.intensity * 100)}
                            onChange={(e) =>
                              w.edit((b) => {
                                b.sections[section.id].parts[i].intensity =
                                  Number(e.target.value) / 100;
                              })
                            }
                          />
                        </label>
                        <label>
                          Volume {Math.round(p.gain * 100)}%
                          <input
                            type="range"
                            min={0}
                            max={200}
                            value={Math.round(p.gain * 100)}
                            onChange={(e) =>
                              w.edit((b) => {
                                b.sections[section.id].parts[i].gain =
                                  Number(e.target.value) / 100;
                              })
                            }
                          />
                        </label>
                        <label className="song-check">
                          <input
                            type="checkbox"
                            checked={p.muted}
                            onChange={(e) =>
                              w.edit((b) => {
                                b.sections[section.id].parts[i].muted =
                                  e.target.checked;
                              })
                            }
                          />
                          Mute
                        </label>
                        <label className="song-check">
                          <input
                            type="checkbox"
                            checked={p.locked}
                            onChange={(e) =>
                              w.edit((b) => {
                                b.sections[section.id].parts[i].locked =
                                  e.target.checked;
                              })
                            }
                          />
                          Lock groove
                        </label>
                      </div>
                    );
                  })}
                </div>
                <p className="song-help">
                  Lock keeps a part when trying another groove. You can still
                  edit it directly. Intensity selects sparse, medium or full
                  patterns.
                </p>
              </details>
            )}
            <div hidden={w.view !== "record"}>
              <section
                className="capture-strip"
                aria-label="Retrospective capture"
              >
                <div>
                  <strong>Keep what you just played</strong>
                  <p>
                    {w.captureSeconds
                      ? `Capture armed: last ${w.captureSeconds} seconds. Audio stays on this computer.`
                      : "Arm capture before playing. Nothing is retained while it is off."}
                  </p>
                </div>
                <div className="song-actions">
                  <label>
                    History
                    <select
                      aria-label="Capture length"
                      disabled={w.captureSeconds > 0 || w.busy}
                      value={captureLength}
                      onChange={(e) => setCaptureLength(Number(e.target.value))}
                    >
                      <option value={15}>15 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </label>
                  <Button
                    disabled={w.busy || isPreview}
                    onClick={() =>
                      run(() => w.arm(w.captureSeconds ? 0 : captureLength))
                    }
                  >
                    {w.captureSeconds ? "Disarm capture" : "Arm capture"}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!w.captureSeconds || w.busy || isPreview}
                    onClick={() => run(w.keep)}
                  >
                    Keep that (H)
                  </Button>
                </div>
              </section>
              <FootControls />
            </div>
            <section hidden={w.view !== "record"}>
              <div className="song-section-heading">
                <h2>Guitar layers</h2>
                <NumberField
                  label="Bars in trimmed riff"
                  value={fitBars}
                  min={1}
                  max={32}
                  change={setFitBars}
                />
              </div>
              {song.body.clips.length === 0 && (
                <p className="song-help">
                  Add a take below. Trim the riff, set its first bar, then
                  repeat it or record over it.
                </p>
              )}
              {song.body.clips.map((c, i) => (
                <div className="song-clip" key={`${c.takeId}-${i}`}>
                  <label>
                    Layer name
                    <input
                      value={c.label}
                      onChange={(e) =>
                        w.edit((b) => {
                          b.clips[i].label = e.target.value;
                        })
                      }
                    />
                  </label>
                  <NumberField
                    label="Trim start (s)"
                    value={c.trimStart}
                    min={0}
                    max={c.trimEnd}
                    step={0.001}
                    change={(v) =>
                      w.edit((b) => {
                        b.clips[i].trimStart = v;
                      })
                    }
                  />
                  <NumberField
                    label="Trim end (s)"
                    value={c.trimEnd}
                    min={0.001}
                    max={
                      takes.find((t) => t.id === c.takeId)?.durationSecs ??
                      c.trimEnd
                    }
                    step={0.001}
                    change={(v) =>
                      w.edit((b) => {
                        b.clips[i].trimEnd = v;
                      })
                    }
                  />
                  <NumberField
                    label="First bar"
                    value={c.startBar}
                    min={1}
                    max={256}
                    change={(v) =>
                      w.edit((b) => {
                        b.clips[i].startBar = v;
                      })
                    }
                  />
                  <NumberField
                    label="Repeats"
                    value={c.repeats}
                    min={1}
                    max={64}
                    change={(v) =>
                      w.edit((b) => {
                        b.clips[i].repeats = v;
                      })
                    }
                  />
                  <NumberField
                    label="Volume (%)"
                    value={Math.round(c.gain * 100)}
                    min={0}
                    max={200}
                    change={(v) =>
                      w.edit((b) => {
                        b.clips[i].gain = v / 100;
                      })
                    }
                  />
                  <label className="song-check">
                    <input
                      type="checkbox"
                      checked={c.muted}
                      onChange={(e) =>
                        w.edit((b) => {
                          b.clips[i].muted = e.target.checked;
                        })
                      }
                    />
                    Mute
                  </label>
                  <Button
                    onClick={() =>
                      run(async () => {
                        const bpm = fitTempo(c, fitBars);
                        w.edit((b) => {
                          b.chart.defaultBpm = bpm;
                        });
                      })
                    }
                  >
                    Fit tempo to riff
                  </Button>
                  <Button
                    disabled={isPreview}
                    onClick={() =>
                      run(async () => {
                        await ipc.invoke("clip_audition", { spec: c });
                      })
                    }
                  >
                    Listen to trim
                  </Button>
                  <Button
                    onClick={() =>
                      w.edit((b) => {
                        b.clips.splice(i, 1);
                      })
                    }
                  >
                    Remove layer
                  </Button>
                </div>
              ))}
              <p className="song-help">
                Fit tempo changes the band to match your trimmed riff. It does
                not stretch or retune the recording. Removed layers remain in
                Takes.
              </p>
            </section>
            <section hidden={w.view !== "versions"}>
              <div className="song-section-heading">
                <h2>Versions</h2>
                <div className="song-actions">
                  <label>
                    Version name
                    <input
                      value={versionName}
                      onChange={(e) => setVersionName(e.target.value)}
                      placeholder="Chorus with space"
                      maxLength={80}
                    />
                  </label>
                  <Button
                    onClick={() => {
                      w.version(versionName);
                      setVersionName("");
                    }}
                  >
                    Keep version
                  </Button>
                </div>
              </div>
              <p className="song-help">
                Keep a version before experimenting. Restore either version and
                press Play to compare; Undo brings your last edit back.
              </p>
              <div className="song-versions">
                {song.versions.map((v) => (
                  <div key={v.id}>
                    <strong>{v.name}</strong>
                    <Button onClick={() => w.restore(v.id)}>Restore</Button>
                    <Button
                      onClick={() =>
                        useWriting.setState({
                          song: {
                            ...song,
                            versions: song.versions.filter(
                              (x) => x.id !== v.id,
                            ),
                          },
                          dirty: true,
                        })
                      }
                    >
                      Remove version
                    </Button>
                  </div>
                ))}
              </div>
              <label>
                Song notes
                <textarea
                  rows={3}
                  value={song.body.notes}
                  onChange={(e) =>
                    w.edit((b) => {
                      b.notes = e.target.value;
                    })
                  }
                  placeholder="What should the next section feel like?"
                />
              </label>
            </section>
          </fieldset>
          <div hidden={w.view !== "compose" && w.view !== "lyrics"}>
            <SongLab />
          </div>
        </>
      )}
      <section
        className="song-takes"
        hidden={Boolean(song) && w.view !== "record"}
      >
        <div className="song-section-heading">
          <h2>Takes and ideas</h2>
          <Button disabled={w.busy} onClick={() => run(loadTakes)}>
            Refresh takes
          </Button>
        </div>
        <p className="song-help">
          Export for Logic or REAPER. REAPER gets a session builder with aligned
          tracks, section markers and editable band MIDI. Read
          REAPER-START-HERE.txt in the export folder; REAPER is installed
          separately.
        </p>
        {!takes.length && (
          <p className="song-help">
            Your saved ideas and recorded takes appear here.
          </p>
        )}
        {takes.map((t) => (
          <div key={t.id} className="song-take">
            <div>
              <strong>
                {t.sessionId === song?.id
                  ? "This song"
                  : t.styleId === "captured-idea"
                    ? "Captured idea"
                    : "Take"}
              </strong>
              <span>
                {t.durationSecs.toFixed(1)} s · {t.tempo.toFixed(1)} BPM
              </span>
              <small>{t.id}</small>
            </div>
            <div className="song-actions">
              <Button
                disabled={w.busy || isPreview || isRecording}
                onClick={() =>
                  run(async () => {
                    await ipc.invoke("clip_audition", {
                      spec: {
                        takeId: t.id,
                        label: "Preview",
                        trimStart: 0,
                        trimEnd: t.durationSecs,
                        startBar: 1,
                        repeats: 1,
                        gain: 1,
                        muted: false,
                      },
                    });
                  })
                }
              >
                Listen to guitar
              </Button>
              <Button
                disabled={w.busy || isPreview}
                onClick={() => run(() => favourite(t.id, !t.favourite))}
              >
                {t.favourite ? "Favourite" : "Mark favourite"}
              </Button>
              <Button
                disabled={
                  !song || w.busy || isRecording || song.body.clips.length >= 16
                }
                onClick={() => w.attach(t)}
              >
                Add guitar layer
              </Button>
              <Button
                disabled={w.busy || isPreview}
                onClick={() =>
                  run(async () => {
                    const r = await exportTakeDaw(t.id);
                    if (r)
                      useWriting.setState({
                        message: r.missingStems.length
                          ? `Export incomplete: ${r.missingStems.length} stems missing. Check ${r.dir}.`
                          : `Exported to ${r.dir}.${r.reaperScript ? " For REAPER, follow REAPER-START-HERE.txt in that folder." : ""}`,
                      });
                  })
                }
              >
                Export for Logic / REAPER
              </Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  change: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft);
    const next =
      draft.trim() && Number.isFinite(v)
        ? Math.max(min, Math.min(max, Math.round(v / step) * step))
        : value;
    setDraft(String(next));
    if (next !== value) change(next);
  };
  return (
    <label>
      {label}
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
