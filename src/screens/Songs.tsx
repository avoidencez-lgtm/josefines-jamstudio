import {
  FilmSlate,
  MusicNotes,
  Play,
  UploadSimple,
  VinylRecord,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Button } from "../components/Button";
import { WorkspaceHeader } from "../components/Workspace";
import { ipc, isPreview } from "../ipc/client";
import {
  type MediaAsset,
  isCancellableMediaWork,
  useMedia,
} from "../lib/media";
import { useEngineStore } from "../store/engine";

export function Songs() {
  const m = useMedia();
  const engine = useEngineStore(
    useShallow((s) => ({
      isRecording: s.isRecording,
      setScreen: s.setScreen,
    })),
  );
  const [path, setPath] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [speed, setSpeed] = useState(75);
  const [semitones, setSemitones] = useState(0);
  const [tools, setTools] = useState({
    ready: false,
    message: "Checking local media tools…",
  });
  useEffect(() => {
    void m.refresh().catch((e) => useMedia.setState({ message: String(e) }));
    if (isPreview)
      setTools({
        ready: false,
        message:
          "Open the desktop app to import and listen. Audio files stay in your local media library.",
      });
    else
      void ipc
        .invoke<typeof tools>("media_tools")
        .then(setTools)
        .catch((e) => setTools({ ready: false, message: String(e) }));
  }, [m.refresh]);
  const songs = m.assets.filter((a) => a.kind === "audio");
  const visible = songs.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()),
  );
  const song = visible.find((a) => a.id === selected) ?? visible[0];
  const lyrics = m.jobs.find((j) => j.assetId === song?.id)?.lyrics;
  const locked = Boolean(m.busy) || engine.isRecording;
  return (
    <div className="workspace-stack max-w-6xl mx-auto">
      <WorkspaceHeader
        screen="songs"
        title="A shelf for your sound."
        description="Keep finished mixes, reference tracks and generated songs together. Listen, then take a song into Film."
      >
        <Button onClick={() => engine.setScreen("ai-music")}>
          <MusicNotes size={18} aria-hidden="true" /> Generate a song
        </Button>
      </WorkspaceHeader>
      <div className="workspace-summary">
        <span>
          <strong>{songs.length}</strong>audio files
        </span>
        <span>
          <strong>
            {Math.round(songs.reduce((n, a) => n + a.seconds, 0) / 60)}
          </strong>
          minutes
        </span>
        <span>Stored on your computer</span>
      </div>
      <div className="workspace-search">
        <label>
          Search
          <input
            type="search"
            aria-label="Search songs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a mix or reference"
          />
        </label>
        <Button
          disabled={locked}
          onClick={() => void m.work("Refreshing audio library", m.refresh)}
        >
          Refresh library
        </Button>
      </div>
      <details className="workspace-stack" open={!songs.length || undefined}>
        <summary className="cursor-pointer text-sm">
          Import a finished mix or reference
        </summary>
        <div className="workspace-search mt-3">
          <label>
            File path
            <input
              aria-label="Audio file path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="Full path to WAV, MP3, FLAC or OGG"
            />
          </label>
          <Button
            variant="primary"
            disabled={locked || isPreview || !tools.ready || !path.trim()}
            onClick={() =>
              void m.work("Importing song", async () => {
                const asset = await ipc.invoke<MediaAsset>("media_import", {
                  path: path.trim(),
                  kind: "audio",
                });
                await m.refresh();
                setSelected(asset.id);
                setPath("");
              })
            }
          >
            <UploadSimple size={18} aria-hidden="true" /> Import audio
          </Button>
        </div>
        <p className="workspace-note mt-2">
          {tools.message} Files are copied into the library; up to 512 MB and 10
          minutes each.
        </p>
      </details>
      {(m.busy || m.message) && (
        <output className="workspace-note">{m.busy || m.message}</output>
      )}
      {isCancellableMediaWork(m.busy) && (
        <Button
          onClick={() =>
            void ipc
              .invoke("media_cancel")
              .catch((e) => useMedia.setState({ message: String(e) }))
          }
        >
          Cancel practice copy
        </Button>
      )}
      {!visible.length ? (
        <div className="workspace-empty">
          <VinylRecord size={52} aria-hidden="true" />
          <h2>
            {songs.length
              ? "No matching songs"
              : "Start with something you want to hear again."}
          </h2>
          <p>
            {songs.length
              ? "Try another title or clear the search."
              : "Import your own mix, or create an idea in AI Music. Your recordings are in Sessions."}
          </p>
          <Button
            onClick={() =>
              songs.length ? setQuery("") : engine.setScreen("sessions")
            }
          >
            {songs.length ? "Clear search" : "Open recorded takes"}
          </Button>
        </div>
      ) : (
        <div className="song-collection">
          <ul aria-label="Audio library">
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
                      {String(Math.floor(a.seconds % 60)).padStart(2, "0")} ·
                      audio
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
                {song.seconds.toFixed(1)} seconds · plays as saved
              </p>
              <div className="workspace-actions">
                <Button
                  variant="primary"
                  disabled={locked || isPreview}
                  onClick={() =>
                    void m.work("Opening song", async () => {
                      await ipc.invoke("media_open", { path: song.path });
                    })
                  }
                >
                  <Play size={18} aria-hidden="true" /> Listen in media player
                </Button>
                <Button
                  disabled={locked}
                  onClick={() => {
                    m.edit({ audioId: song.id });
                    engine.setScreen("music-video");
                  }}
                >
                  <FilmSlate size={18} aria-hidden="true" /> Use in Film
                </Button>
              </div>
              <details className="workspace-stack">
                <summary className="cursor-pointer text-sm">
                  Make a practice copy
                </summary>
                <p className="workspace-note">
                  Change speed without changing pitch, or transpose up to an
                  octave. A new stereo WAV is saved in this library; the
                  selected file stays unchanged. Rendering happens locally and
                  may take a little time.
                </p>
                <div className="workspace-actions">
                  <label className="room-tool-field">
                    Speed · {speed}%
                    <input
                      aria-label="Practice speed"
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
                    Transpose
                    <select
                      value={semitones}
                      disabled={locked}
                      onChange={(e) => setSemitones(Number(e.target.value))}
                    >
                      {Array.from({ length: 25 }, (_, i) => i - 12).map((n) => (
                        <option key={n} value={n}>
                          {n > 0 ? "+" : ""}
                          {n} semitones
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={locked || isPreview || !tools.ready}
                    onClick={() =>
                      void m.work("Preparing practice copy", async () => {
                        const copy = await ipc.invoke<MediaAsset>(
                          "media_stretch",
                          { assetId: song.id, speed: speed / 100, semitones },
                        );
                        await m.refresh();
                        setSelected(copy.id);
                        setQuery("");
                        useMedia.setState({
                          message:
                            "Practice copy saved. Choose Listen in media player to hear it.",
                        });
                      })
                    }
                  >
                    Create practice copy
                  </Button>
                </div>
                <p className="workspace-note">
                  {!tools.ready && `${tools.message} `}Sources can be up to 10
                  minutes; slowed copies can be up to 20 minutes. To try another
                  setting on a longer copy, select the original.
                </p>
              </details>
              {lyrics && (
                <details>
                  <summary>Generated lyrics & structure</summary>
                  <p className="whitespace-pre-wrap text-sm mt-3">{lyrics}</p>
                </details>
              )}
              <details>
                <summary className="cursor-pointer text-sm">Local file</summary>
                <p className="workspace-note break-all mt-2">{song.path}</p>
              </details>
            </section>
          )}
        </div>
      )}
      <p className="workspace-note">
        Reference playback opens your system player. Practice copies support
        local speed and pitch changes. Stem separation, automatic chord
        detection and transport-synchronised reference playback are not
        available yet. Use Library for chord charts and Stage for rehearsing
        them.
      </p>
    </div>
  );
}
