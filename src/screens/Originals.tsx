import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Button } from "../components/Button";
import { FinishingDesk } from "../components/FinishingDesk";
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
import { WRITING_HELP } from "../lib/help";
import { committedNumber } from "../lib/numberField";
import { PARTS, changeGroove, fitTempo, useWriting } from "../lib/originals";
import { useEngineStore } from "../store/engine";
import "./originals.css";

export function Originals({ onHelp }: { onHelp: (topic: string) => void }) {
  const w = useWriting();
  const {
    styles,
    takes,
    isRecording,
    recordingError,
    loadTakes,
    loadLibrary,
    exportTakeDaw,
    transportStop,
    rigState,
    loadRigProfiles,
    loadedOriginal,
    currentChart,
  } = useEngineStore(
    useShallow((s) => ({
      styles: s.styles,
      takes: s.takes,
      isRecording: s.isRecording,
      recordingError: s.recordingError,
      loadTakes: s.loadTakes,
      loadLibrary: s.loadLibrary,
      exportTakeDaw: s.exportTakeDaw,
      transportStop: s.transportStop,
      rigState: s.rigState,
      loadRigProfiles: s.loadRigProfiles,
      loadedOriginal: s.loadedOriginal,
      currentChart: s.currentChart,
    })),
  );
  const [versionName, setVersionName] = useState("");
  const [captureLength, setCaptureLength] = useState(30);
  const [fitBars, setFitBars] = useState(4);
  const song = w.song;
  const draftLoaded =
    song &&
    loadedOriginal?.id === song.id &&
    JSON.stringify(loadedOriginal.body) === JSON.stringify(song.body);
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
  const run = (fn: () => Promise<unknown>) => w.action(fn);
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
              Name this song.
              <input
                value={song.body.chart.name}
                maxLength={120}
                disabled={w.busy || isRecording}
                onChange={(e) =>
                  w.edit((b) => {
                    b.chart.name = e.target.value;
                  }, "title")
                }
              />
            </label>
          )}
        </div>
        <div className="song-actions">
          <label>
            Open a saved song.
            <select
              aria-label="Open a saved song."
              value={song?.revision ? song.id : ""}
              disabled={w.busy || isRecording}
              onChange={(e) => {
                const s = w.saved.find((s) => s.id === e.target.value);
                if (s) w.openSong(s);
              }}
            >
              <option value="">Choose a saved song.</option>
              {w.saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.body.chart.name}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={w.createSong} disabled={w.busy || isRecording}>
            Create this new song.
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
          <h2>Start with your own idea.</h2>
          <p>
            Create this new song, then use Record & layers to capture a riff.
            You can add a recorded idea whenever you are ready.
          </p>
          <Button variant="primary" onClick={w.createSong}>
            Create this new song.
          </Button>
        </section>
      ) : (
        <>
          <div className="song-toolbar">
            <span className="song-save-state">
              {w.dirty ? "These are unsaved changes." : "This is saved."}
            </span>
            <Button
              disabled={w.busy || isRecording}
              title="Write this draft as a new song so a conflicting save does not overwrite the other version"
              onClick={() => run(w.saveCopy)}
            >
              Save this copy.
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
              Save this song.
            </Button>
            <Button
              variant="primary"
              disabled={w.busy || isRecording || isPreview}
              title="This loads the current song edits and plays from the beginning."
              onClick={() => run(w.play)}
            >
              Play this song.
            </Button>
            <Button
              disabled={w.busy || isRecording || isPreview}
              onClick={() => run(() => w.rehearse())}
            >
              Loop this section.
            </Button>
            <Button
              disabled={w.busy || isRecording || isPreview}
              hidden={w.view !== "record"}
              onClick={() => run(() => w.rehearse(true))}
            >
              Loop this next section.
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
              title="This starts at bar 1 and records a new take while guitar layers play."
              onClick={() => run(w.record)}
            >
              {recordingError
                ? "Save partial take"
                : isRecording
                  ? "Save this take."
                  : "Record this take."}
            </Button>
          </div>
          <output className="song-loaded-state">
            <span>
              {currentChart
                ? `${currentChart.name} is loaded in the band`
                : "No arrangement is loaded in the band"}
              {draftLoaded
                ? ". This draft is loaded."
                : ". Play this song loads your current draft; Space resumes the loaded arrangement."}
            </span>
            <button
              type="button"
              onClick={() => onHelp("write.song-map-and-linked-sections")}
              aria-label="Help with this loaded arrangement."
            >
              ?
            </button>
          </output>
          <div className="write-navigation">
            <nav
              className="write-views"
              aria-label="These are the writing views."
            >
              {(
                [
                  ["compose", "Compose"],
                  ["lyrics", "Lyrics"],
                  ["record", "Record & layers"],
                  ["finish", "Finish"],
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
            </nav>
            <Button onClick={() => onHelp(WRITING_HELP[w.view].topic)}>
              Open help for {WRITING_HELP[w.view].label}.
            </Button>
            <fieldset
              title="Key transposes chords. Mode changes only the harmony palette. Recorded guitar retains pitch and speed."
              className="write-key-settings"
              disabled={w.busy || isRecording}
            >
              <NumberField
                label="Tempo is in BPM."
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
                Choose the key.
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
                Choose the mode.
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
            <legend className="sr-only">These are the song settings.</legend>
            <ArrangementDesk />
            <div hidden={w.view !== "finish"}>
              <FinishingDesk key={song.id} />
            </div>
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
                  <h2>Edit this section.</h2>
                  <label>
                    Name this section.
                    <input
                      value={section.name}
                      maxLength={80}
                      onChange={(e) =>
                        w.edit((b) => {
                          const s = b.chart.sections.find(
                            (s) => s.id === section.id,
                          );
                          if (s) s.name = e.target.value;
                        }, `section-name:${section.id}`)
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
                    Let this song change my rig tones.
                  </label>
                  <span className="song-help">
                    {song.body.toneProfileId ||
                      rigState?.currentProfile.name ||
                      "Choose a rig profile"}
                    . MIDI output is selected in Rig.
                  </span>
                </div>
                {song.body.toneProfileId && (
                  <label>
                    Choose the tone on section entry.
                    <select
                      aria-label="Choose the tone on section entry."
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
                      <option value="">Keep the current tone.</option>
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
                    Choose a groove to try.
                    <select
                      aria-label="Choose a groove to try."
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
                      <option value="">Change unlocked parts.</option>
                      {styles
                        .filter(
                          (s) =>
                            s.feel.timeSig[0] === 4 && s.feel.timeSig[1] === 4,
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <NumberField
                    label="Swing is a percent."
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
                          Choose the groove.
                          <select
                            value={p.styleId}
                            onChange={(e) =>
                              w.edit((b) => {
                                b.sections[section.id].parts[i].styleId =
                                  e.target.value;
                              })
                            }
                          >
                            {styles
                              .filter(
                                (s) =>
                                  s.feel.timeSig[0] === 4 &&
                                  s.feel.timeSig[1] === 4,
                              )
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Intensity is {Math.round(p.intensity * 100)}%.
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(p.intensity * 100)}
                            onChange={(e) =>
                              w.edit((b) => {
                                b.sections[section.id].parts[i].intensity =
                                  Number(e.target.value) / 100;
                              }, `intensity:${section.id}:${i}`)
                            }
                          />
                        </label>
                        <label>
                          Volume is {Math.round(p.gain * 100)}%.
                          <input
                            type="range"
                            min={0}
                            max={200}
                            value={Math.round(p.gain * 100)}
                            onChange={(e) =>
                              w.edit((b) => {
                                b.sections[section.id].parts[i].gain =
                                  Number(e.target.value) / 100;
                              }, `gain:${section.id}:${i}`)
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
                          Mute this part.
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
                          Lock this groove.
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
                aria-label="This is the retrospective capture."
              >
                <div>
                  <strong>Keep what you just played.</strong>
                  <p>
                    {w.captureSeconds
                      ? `Capture is armed for the last ${w.captureSeconds} seconds. Audio stays on this computer.`
                      : "Arm this capture before playing. Nothing is retained while it is off."}
                  </p>
                </div>
                <div className="song-actions">
                  <label>
                    Choose the capture length.
                    <select
                      aria-label="Choose the capture length."
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
                    {w.captureSeconds
                      ? "Disarm this capture."
                      : "Arm this capture."}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!w.captureSeconds || w.busy || isPreview}
                    onClick={() => run(w.keep)}
                  >
                    Keep that take. H is the shortcut.
                  </Button>
                </div>
              </section>
              <FootControls />
            </div>
            <section hidden={w.view !== "record"}>
              <div className="song-section-heading">
                <h2>These are the guitar layers.</h2>
                <NumberField
                  label="How many bars are in the trimmed riff."
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
                    Name this layer.
                    <input
                      value={c.label}
                      onChange={(e) =>
                        w.edit((b) => {
                          b.clips[i].label = e.target.value;
                        }, `clip-label:${i}`)
                      }
                    />
                  </label>
                  <NumberField
                    label="Trim start is in seconds."
                    value={c.trimStart}
                    min={0}
                    max={c.trimEnd - 0.001}
                    step={0.001}
                    change={(v) =>
                      w.edit((b) => {
                        b.clips[i].trimStart = v;
                      })
                    }
                  />
                  <NumberField
                    label="Trim end is in seconds."
                    value={c.trimEnd}
                    min={c.trimStart + 0.001}
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
                    label="This layer starts at this bar."
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
                    label="How many times this layer repeats."
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
                    label="Layer volume is a percent."
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
                    Mute this layer.
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
                    Fit the tempo to this riff.
                  </Button>
                  <Button
                    disabled={isPreview}
                    onClick={() =>
                      run(async () => {
                        await ipc.invoke("clip_audition", { spec: c });
                      })
                    }
                  >
                    Listen to this trim.
                  </Button>
                  <Button
                    onClick={() =>
                      w.edit((b) => {
                        b.clips.splice(i, 1);
                      })
                    }
                  >
                    Remove this layer.
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
                <h2>These are the saved versions.</h2>
                <div className="song-actions">
                  <label>
                    Name this version.
                    <input
                      value={versionName}
                      onChange={(e) => setVersionName(e.target.value)}
                      placeholder="A chorus with space."
                      maxLength={80}
                    />
                  </label>
                  <Button
                    onClick={() => {
                      w.version(versionName);
                      setVersionName("");
                    }}
                  >
                    Keep this version.
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
                      Remove this version.
                    </Button>
                  </div>
                ))}
              </div>
              <label>
                Write the song notes.
                <textarea
                  rows={3}
                  value={song.body.notes}
                  onChange={(e) =>
                    w.edit((b) => {
                      b.notes = e.target.value;
                    }, "notes")
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
          <h2>These are the takes and ideas.</h2>
          <Button disabled={w.busy} onClick={() => run(loadTakes)}>
            Refresh these takes.
          </Button>
        </div>
        <p className="song-help">
          Export for Logic or REAPER. The folder includes README.txt with Logic
          steps (File → Open the tempo-map MIDI, keep tempo, drag WAVs to bar
          1). Opening the project in Logic stays a V2 owner gate. REAPER gets a
          session builder; read REAPER-START-HERE.txt. REAPER is installed
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
                  ? "This is from this song."
                  : t.styleId === "captured-idea"
                    ? "This is a captured idea."
                    : "This is a take."}
              </strong>
              <span>
                {t.durationSecs.toFixed(1)} s. {t.tempo.toFixed(1)} BPM.
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
                        label: "This is a preview.",
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
                Listen to the guitar.
              </Button>
              <Button
                disabled={w.busy || isPreview}
                onClick={() => run(() => favourite(t.id, !t.favourite))}
              >
                {t.favourite ? "This is a favourite." : "Mark this favourite."}
              </Button>
              <Button
                disabled={
                  !song || w.busy || isRecording || song.body.clips.length >= 16
                }
                onClick={() => w.attach(t)}
              >
                Add a guitar layer.
              </Button>
              <Button
                disabled={w.busy || isPreview}
                onClick={() =>
                  run(async () => {
                    const r = await exportTakeDaw(t.id);
                    if (r)
                      useWriting.setState({
                        message: r.missingStems.length
                          ? `Export is incomplete. ${r.missingStems.length} stems are missing. Check ${r.dir}.`
                          : `Exported to ${r.dir}. Open README.txt for Logic steps.${r.reaperScript ? " For REAPER, follow REAPER-START-HERE.txt." : ""}`,
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
    const next = committedNumber(draft, value, min, max, step);
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
