import {
  FilmSlate,
  MusicNotes,
  Play,
  UploadSimple,
  VinylRecord,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Button } from "../components/Button";
import { ProviderEstimates } from "../components/ProviderEstimates";
import { ReferenceGridEditor } from "../components/ReferenceGrid";
import { ReferencePlayer } from "../components/ReferencePlayer";
import { SongAnalysis } from "../components/SongAnalysis";
import { StemPreparation } from "../components/Stems";
import { WorkspaceHeader } from "../components/Workspace";
import { ipc, isPreview } from "../ipc/client";
import {
  type MediaAsset,
  deleteLibraryMedia,
  loadReference,
  useMedia,
} from "../lib/media";
import { readAnalysisStatus } from "../lib/songAnalysis";
import { useEngineStore } from "../store/engine";

export function Songs() {
  const m = useMedia();
  const engine = useEngineStore(
    useShallow((s) => ({
      isRecording: s.isRecording,
      reference: s.telemetry.reference,
      setScreen: s.setScreen,
    })),
  );
  const [path, setPath] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [speed, setSpeed] = useState(75);
  const [semitones, setSemitones] = useState(0);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    void m.refresh().catch((e) => useMedia.setState({ message: String(e) }));
  }, [m.refresh]);
  const importPath = useCallback(
    (source: string) => {
      if (
        isPreview ||
        useEngineStore.getState().isRecording ||
        useMedia.getState().busy
      ) {
        useMedia.setState({
          message:
            "Finish the current operation or recording before importing audio.",
        });
        return;
      }
      void m.work("Importing and analyzing this song.", async () => {
        const asset = await ipc
          .invoke<MediaAsset>("media_import", {
            path: source,
            kind: "audio",
          })
          .catch(async (error) => {
            // A published song survives an analysis/storage error. Show it if possible.
            await m.refresh().catch(() => undefined);
            throw error;
          });
        await m.refresh();
        setSelected(asset.id);
        setQuery("");
        setPath("");
        useMedia.setState({
          message: `Song imported locally. ${readAnalysisStatus(asset.analysisStatus)?.message ?? "Load this in Jamstudio to play it."}`,
        });
      });
    },
    [m.work, m.refresh],
  );
  useEffect(() => {
    if (isPreview) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(({ payload }) => {
          if (!active || payload.type !== "drop") return;
          if (payload.paths.length !== 1) {
            useMedia.setState({ message: "Drop one audio file at a time." });
            return;
          }
          importPath(payload.paths[0]);
        }),
      )
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch((e) => {
        if (active)
          useMedia.setState({
            message: `File drop is unavailable. ${String(e).replace(/^Error:\s*/, "")}. Use Choose an audio file or paste its path.`,
          });
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [importPath]);
  const songs = m.assets.filter((a) => a.kind === "audio");
  const visible = songs.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()),
  );
  const song = visible.find((a) => a.id === selected) ?? visible[0];
  const lyrics = m.jobs.find((j) => j.assetId === song?.id)?.lyrics;
  const locked = picking || Boolean(m.busy) || engine.isRecording;
  return (
    <div className="workspace-stack max-w-6xl mx-auto">
      <WorkspaceHeader
        screen="songs"
        title="A shelf for your sound."
        description="Keep finished mixes, reference tracks and generated songs together. Rehearse here or take a song into Film."
      >
        <Button onClick={() => engine.setScreen("ai-music")}>
          <MusicNotes size={18} aria-hidden="true" /> Generate a song
        </Button>
      </WorkspaceHeader>
      <div className="workspace-summary">
        <span>
          <strong>{songs.length}</strong> audio files.
        </span>
        <span>
          <strong>
            {Math.round(songs.reduce((n, a) => n + a.seconds, 0) / 60)}
          </strong>
          minutes.
        </span>
        <span>Stored on your computer.</span>
      </div>
      <div className="workspace-search">
        <label>
          Search the library.
          <input
            type="search"
            aria-label="Search the library."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a mix or reference."
          />
        </label>
        <Button
          disabled={locked}
          onClick={() =>
            void m.work("Refreshing this audio library.", m.refresh)
          }
        >
          Refresh this library.
        </Button>
      </div>
      <details className="workspace-stack" open={!songs.length || undefined}>
        <summary className="cursor-pointer text-sm">
          Import a finished mix or reference.
        </summary>
        <div className="workspace-actions mt-3">
          <Button
            disabled={locked || isPreview}
            onClick={() => {
              setPicking(true);
              void ipc
                .invoke<string | null>("song_pick_file")
                .then((file) => {
                  if (file) importPath(file);
                })
                .catch((e) => useMedia.setState({ message: String(e) }))
                .finally(() => setPicking(false));
            }}
          >
            Choose an audio file.
          </Button>
          <p className="workspace-note">
            Or drop one audio file anywhere in Songs.
          </p>
        </div>
        <div className="workspace-search mt-3">
          <label>
            Enter the audio file path.
            <input
              aria-label="Enter the audio file path."
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="Paste the full path to a WAV, MP3, FLAC, M4A, AIFF or OGG file."
            />
          </label>
          <Button
            variant="primary"
            disabled={locked || isPreview || !path.trim()}
            onClick={() => importPath(path.trim())}
          >
            <UploadSimple size={18} aria-hidden="true" /> Import this audio.
          </Button>
        </div>
        <p className="workspace-note mt-2">
          {isPreview && "Open the desktop app to import and listen. "}
          WAV, MP3, FLAC, AAC/ALAC M4A, AIFF and Ogg Vorbis. Mono or stereo. Up
          to 512 MB and 10 minutes. Import, analysis and playback run locally
          without FFmpeg. Your original is kept beside a 48 kHz source WAV.
        </p>
      </details>
      {(m.busy || m.message) && (
        <output className="workspace-note">{m.busy || m.message}</output>
      )}
      {(m.busy === "Preparing this practice copy." ||
        m.busy === "Separating these stems." ||
        m.busy === "Importing these stems." ||
        m.busy === "Loading this reference." ||
        m.busy === "Analyzing this song locally." ||
        m.busy === "Consolidating these song files." ||
        m.busy === "Importing and analyzing this song.") && (
        <Button
          onClick={() =>
            void ipc
              .invoke("media_cancel")
              .catch((e) => useMedia.setState({ message: String(e) }))
          }
        >
          Cancel this current operation.
        </Button>
      )}
      {engine.reference && (
        <ReferencePlayer
          key={engine.reference.asset_id}
          song={engine.reference}
        />
      )}
      {!visible.length ? (
        <div className="workspace-empty">
          <VinylRecord size={52} aria-hidden="true" />
          <h2>
            {songs.length
              ? "No matching songs."
              : "Start with something you want to hear again."}
          </h2>
          <p>
            {songs.length
              ? "Try another title or clear the search."
              : "Drop an audio file here. Import your own mix, or create an idea in AI Music. Your recordings are in Sessions."}
          </p>
          <Button
            onClick={() =>
              songs.length ? setQuery("") : engine.setScreen("sessions")
            }
          >
            {songs.length ? "Clear this search." : "Open recorded takes."}
          </Button>
        </div>
      ) : (
        <div className="song-collection">
          <ul aria-label="This is the audio library.">
            {visible.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={song?.id === a.id}
                  onClick={() => setSelected(a.id)}
                >
                  <VinylRecord size={30} aria-hidden="true" />
                  <span>
                    {a.label}
                    <small>
                      {Math.floor(a.seconds / 60)}:
                      {String(Math.floor(a.seconds % 60)).padStart(2, "0")}.
                      Audio. Analysis is{" "}
                      {readAnalysisStatus(a.analysisStatus)?.state ??
                        (a.songAnalysis ? "saved" : "not started")}
                      .
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {song && (
            <section className="song-detail workspace-stack">
              <VinylRecord size={72} aria-hidden="true" />
              <h2>{song.label}</h2>
              <p className="workspace-note">
                {song.seconds.toFixed(1)} seconds. Plays as saved.
              </p>
              <div className="workspace-actions">
                <Button
                  disabled={
                    locked ||
                    isPreview ||
                    song.seconds < 2 ||
                    song.seconds > 1200
                  }
                  onClick={() =>
                    void m.work("Analyzing this song locally.", async () => {
                      try {
                        await ipc.invoke("media_analyze", { assetId: song.id });
                      } catch (error) {
                        await m.refresh().catch(() => undefined);
                        throw error;
                      }
                      await m.refresh();
                      useMedia.setState({
                        message:
                          "Analysis saved locally. Check the tempo and chord estimates by ear.",
                      });
                    })
                  }
                >
                  {song.songAnalysis
                    ? "Analyze again."
                    : "Analyze tempo and chords."}
                </Button>
                <Button
                  disabled={locked || isPreview}
                  onClick={() =>
                    void m.work("Loading this reference.", async () => {
                      await loadReference(song.id);
                      useMedia.setState({
                        message:
                          "Reference loaded. Use Play the reference or the top transport to start.",
                      });
                    })
                  }
                >
                  Load this in Jamstudio.
                </Button>
                {Boolean(song.stemSet || song.referencePractice) && (
                  <Button
                    disabled={locked || isPreview}
                    onClick={() =>
                      void m.work("Loading this reference.", async () => {
                        await loadReference(song.id, false);
                        useMedia.setState({
                          message:
                            "Original stereo mix loaded at 100% in its original key. Saved stems and practice settings are kept.",
                        });
                      })
                    }
                  >
                    Load this original mix.
                  </Button>
                )}
                <Button
                  disabled={locked || isPreview}
                  onClick={() =>
                    void m.work("Loading this minus-guitar mix.", async () => {
                      await loadReference(song.id, false, true);
                      useMedia.setState({
                        message:
                          "Minus-guitar mix loaded. Synthetic/local residual only. Real-song residual at or below -6 dB is not claimed. Use Play the reference or the top transport to start.",
                      });
                    })
                  }
                >
                  Load this minus-guitar mix.
                </Button>
                <Button
                  variant="primary"
                  disabled={locked || isPreview}
                  onClick={() =>
                    void m.work("Opening this song.", async () => {
                      await ipc.invoke("media_open", { path: song.path });
                    })
                  }
                >
                  <Play size={18} aria-hidden="true" /> Listen in the media
                  player.
                </Button>
                <Button
                  disabled={locked}
                  onClick={() => {
                    m.edit({ audioId: song.id });
                    engine.setScreen("music-video");
                  }}
                >
                  <FilmSlate size={18} aria-hidden="true" /> Use this in Film.
                </Button>
                <Button
                  variant="danger"
                  disabled={locked || isPreview}
                  onClick={() =>
                    void m.work("Deleting this asset.", async () => {
                      const id = song.id;
                      await deleteLibraryMedia(id, "asset");
                      setSelected((current) => (current === id ? "" : current));
                    })
                  }
                >
                  Delete this asset.
                </Button>
              </div>
              <SongAnalysis
                key={song.id}
                value={song.songAnalysis}
                status={song.analysisStatus}
              />
              <ProviderEstimates
                key={`musicai-${song.id}`}
                song={song}
                locked={locked}
              />
              <ReferenceGridEditor
                key={`grid-${song.id}`}
                song={song}
                locked={locked}
              />
              <StemPreparation
                key={`stems-${song.id}`}
                song={song}
                locked={locked}
              />
              <details className="workspace-stack">
                <summary className="cursor-pointer text-sm">
                  Make this practice copy.
                </summary>
                <p className="workspace-note">
                  Change speed without changing pitch, or transpose up to an
                  octave. A new stereo WAV is saved in this library; the
                  selected file stays unchanged. Rendering happens locally and
                  may take a little time.
                </p>
                <div className="workspace-actions">
                  <label className="room-tool-field">
                    Speed is {speed}%.
                    <input
                      aria-label={`Speed is ${speed}%.`}
                      type="range"
                      min={50}
                      max={150}
                      step={1}
                      value={speed}
                      disabled={locked}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    />
                  </label>
                  <label className="room-tool-field">
                    Choose the transpose.
                    <select
                      value={semitones}
                      disabled={locked}
                      onChange={(e) => setSemitones(Number(e.target.value))}
                    >
                      {Array.from({ length: 25 }, (_, i) => i - 12).map((n) => (
                        <option key={n} value={n}>
                          {n > 0 ? "+" : ""}
                          {n} semitones.
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={locked || isPreview}
                    onClick={() =>
                      void m.work("Preparing this practice copy.", async () => {
                        const copy = await ipc.invoke<MediaAsset>(
                          "media_stretch",
                          { assetId: song.id, speed: speed / 100, semitones },
                        );
                        await m.refresh();
                        setSelected(copy.id);
                        setQuery("");
                        useMedia.setState({
                          message:
                            "Practice copy saved. Choose Listen in the media player to hear it.",
                        });
                      })
                    }
                  >
                    Create this practice copy.
                  </Button>
                </div>
                <p className="workspace-note">
                  Sources can be up to 10 minutes; slowed copies can be up to 20
                  minutes. To try another setting on a longer copy, select the
                  original.
                </p>
              </details>
              {lyrics && (
                <details>
                  <summary>Open the generated lyrics and structure.</summary>
                  <p className="whitespace-pre-wrap text-sm mt-3">{lyrics}</p>
                </details>
              )}
              <details>
                <summary className="cursor-pointer text-sm">
                  This is the local file.
                </summary>
                <p className="workspace-note break-all mt-2">{song.path}</p>
                <p className="workspace-note mt-2">
                  Keep the source, stems and saved settings in one portable song
                  folder. Older media files are copied and kept; existing Film
                  projects keep the same song. Reload the reference afterward.
                </p>
                <Button
                  disabled={locked || isPreview}
                  onClick={() =>
                    void m.work("Consolidating these song files.", async () => {
                      await ipc.invoke("media_store_song", {
                        assetId: song.id,
                      });
                      await m.refresh();
                      useMedia.setState({
                        message:
                          "Song files are together. Load the reference again to use the saved folder.",
                      });
                    })
                  }
                >
                  Keep these song files together.
                </Button>
              </details>
            </section>
          )}
        </div>
      )}
      <p className="workspace-note">
        Load this in Jamstudio plays the reference through the native audio
        engine. It has pause, seek and seconds loops. The system player is also
        available. Practice copies support local speed and pitch changes. Local
        analysis estimates steady tempo, major/minor chords and key. Prepare or
        import stems to mix instruments in the native player. Load this
        minus-guitar mix plays minus-guitar.wav after Check this guitar residual
        passes. It stays loud if that check has not passed or the file is gone.
        Confirm bars and named sections to use section loops; automatic section
        detection is pending. Use Library for chord charts and Stage for
        rehearsing them.
      </p>
    </div>
  );
}
