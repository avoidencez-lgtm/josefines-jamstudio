import type React from "react";
import { useState } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { useEngineStore } from "../store/engine";

export const Songs: React.FC = () => {
  const {
    currentSong,
    songSpeed,
    songTranspose,
    stemSettings,
    importSong,
    setSongSpeed,
    setSongTranspose,
    updateStemSettings,
  } = useEngineStore();

  const [fakeFilePath, setFakeFilePath] = useState("");

  const handleImport = async () => {
    const path = fakeFilePath.trim() || "song-take.wav";
    await importSong(path);
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
              Real Songs & Stem Separation
            </h1>
            <StatusPill
              status={currentSong ? "ok" : "idle"}
              label={currentSong ? "Stem Separated" : "No Song Loaded"}
            />
          </div>
          <p className="text-xs font-mono text-[var(--fg-2)] mt-0.5">
            4-stem demucs separation, pitch-preserving time stretch, and chord
            detection
          </p>
        </div>

        {/* Quick Import Form */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Audio path or song name..."
            value={fakeFilePath}
            onChange={(e) => setFakeFilePath(e.target.value)}
            className="bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2.5 py-1.5 rounded text-xs font-mono w-52 focus:outline-none focus:border-[var(--accent)]"
          />
          <Button size="sm" variant="primary" onClick={handleImport}>
            Import Audio
          </Button>
        </div>
      </div>

      {/* Speed & Pitch Transpose Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        {/* Speed Control */}
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
            Speed
          </span>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={songSpeed}
            onChange={(e) => setSongSpeed(Number.parseFloat(e.target.value))}
            className="w-28 accent-[var(--accent)] cursor-pointer"
          />
          <span className="text-xs font-mono text-[var(--fg-0)] tabular-nums w-12">
            {(songSpeed * 100).toFixed(0)}%
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSongSpeed(0.5)}
            >
              0.5x
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSongSpeed(0.75)}
            >
              0.75x
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSongSpeed(1.0)}
            >
              1.0x
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSongSpeed(1.25)}
            >
              1.25x
            </Button>
          </div>
        </div>

        <div className="h-4 w-px bg-[var(--line)]" />

        {/* Transpose Control */}
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase font-mono text-[var(--fg-2)]">
            Transpose
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSongTranspose(songTranspose - 1)}
          >
            -1 ST
          </Button>
          <span className="text-xs font-mono text-[var(--fg-0)] tabular-nums w-14 text-center">
            {songTranspose > 0 ? `+${songTranspose}` : songTranspose} ST
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSongTranspose(songTranspose + 1)}
          >
            +1 ST
          </Button>
          {songTranspose !== 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSongTranspose(0)}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* 4-Track Stem Mixer */}
      <Panel title="Stem Mixer (Multi-Track Separation)">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Vocals */}
          <StemFader
            title="Vocals"
            color="border-sky-500"
            volume={stemSettings.vocalsVolume}
            mute={stemSettings.vocalsMute}
            solo={stemSettings.vocalsSolo}
            onVolumeChange={(v) => updateStemSettings({ vocalsVolume: v })}
            onToggleMute={() =>
              updateStemSettings({ vocalsMute: !stemSettings.vocalsMute })
            }
            onToggleSolo={() =>
              updateStemSettings({ vocalsSolo: !stemSettings.vocalsSolo })
            }
          />

          {/* Drums */}
          <StemFader
            title="Drums"
            color="border-amber-500"
            volume={stemSettings.drumsVolume}
            mute={stemSettings.drumsMute}
            solo={stemSettings.drumsSolo}
            onVolumeChange={(v) => updateStemSettings({ drumsVolume: v })}
            onToggleMute={() =>
              updateStemSettings({ drumsMute: !stemSettings.drumsMute })
            }
            onToggleSolo={() =>
              updateStemSettings({ drumsSolo: !stemSettings.drumsSolo })
            }
          />

          {/* Bass */}
          <StemFader
            title="Bass"
            color="border-emerald-500"
            volume={stemSettings.bassVolume}
            mute={stemSettings.bassMute}
            solo={stemSettings.bassSolo}
            onVolumeChange={(v) => updateStemSettings({ bassVolume: v })}
            onToggleMute={() =>
              updateStemSettings({ bassMute: !stemSettings.bassMute })
            }
            onToggleSolo={() =>
              updateStemSettings({ bassSolo: !stemSettings.bassSolo })
            }
          />

          {/* Other (Guitars/Keys) */}
          <StemFader
            title="Other (Gtr/Keys)"
            color="border-purple-500"
            volume={stemSettings.otherVolume}
            mute={stemSettings.otherMute}
            solo={stemSettings.otherSolo}
            onVolumeChange={(v) => updateStemSettings({ otherVolume: v })}
            onToggleMute={() =>
              updateStemSettings({ otherMute: !stemSettings.otherMute })
            }
            onToggleSolo={() =>
              updateStemSettings({ otherSolo: !stemSettings.otherSolo })
            }
          />
        </div>
      </Panel>

      {/* Extracted Chord Timeline */}
      <Panel title="Detected Chord Timeline">
        {currentSong ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-[var(--fg-2)]">
              <span>{currentSong.title}</span>
              <span>{currentSong.tempo} BPM</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {currentSong.detectedChords.map((chord, idx) => (
                <div
                  key={`bar-${idx}-${chord}`}
                  className="px-4 py-3 bg-[var(--bg-2)] border border-[var(--line)] rounded-[var(--radius-m)] text-center min-w-[70px]"
                >
                  <div className="text-[10px] uppercase font-mono text-[var(--fg-2)]">
                    Bar {idx + 1}
                  </div>
                  <div className="text-base font-mono font-bold text-[var(--accent)] mt-1">
                    {chord}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs font-mono text-[var(--fg-2)]">
            Import an audio track above to view detected chord harmony and loop
            sections.
          </div>
        )}
      </Panel>
    </div>
  );
};

interface StemFaderProps {
  title: string;
  color: string;
  volume: number;
  mute: boolean;
  solo: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
}

const StemFader: React.FC<StemFaderProps> = ({
  title,
  color,
  volume,
  mute,
  solo,
  onVolumeChange,
  onToggleMute,
  onToggleSolo,
}) => {
  return (
    <div
      className={`p-4 bg-[var(--bg-2)] rounded-[var(--radius-m)] border-t-2 ${color} border-l border-r border-b border-[var(--line)] flex flex-col gap-3`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-[var(--fg-0)]">
          {title}
        </span>
        <span className="text-[11px] font-mono text-[var(--fg-2)]">
          {(volume * 100).toFixed(0)}%
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={1.5}
        step={0.05}
        value={volume}
        disabled={mute}
        onChange={(e) => onVolumeChange(Number.parseFloat(e.target.value))}
        className="w-full accent-[var(--accent)] cursor-pointer"
      />

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant={solo ? "primary" : "secondary"}
          onClick={onToggleSolo}
          className="flex-1"
        >
          Solo
        </Button>
        <Button
          size="sm"
          variant={mute ? "danger" : "secondary"}
          onClick={onToggleMute}
          className="flex-1"
        >
          Mute
        </Button>
      </div>
    </div>
  );
};
