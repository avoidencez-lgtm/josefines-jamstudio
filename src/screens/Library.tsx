import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Button } from "../components/Button";
import { ChordStrip } from "../components/ChordStrip";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { WorkspaceHeader } from "../components/Workspace";
import type { Chart } from "../ipc/contract";
import { keyName } from "../lib/chart/notes";
import { chartToText, parseChartText, resolveChart } from "../lib/chart/text";
import { transposeChart } from "../lib/chart/transpose";
import { useLibraryDraft } from "../lib/libraryDraft";
import { useEngineStore } from "../store/engine";

const TEMPLATE = `# New Tune
key: A major
time: 4/4
bpm: 110
style: blues-shuffle

[Verse x2]
| A7 | D7 | A7 | E7 |

[Bridge]
| Dm7 G7 | Cmaj7 | % | Bm7b5 E7 | Am7:3 D7:1 |
`;

const setText = (text: string) => useLibraryDraft.setState({ text });
const setEditingId = (editingId: string | null) =>
  useLibraryDraft.setState({ editingId });
const setDirty = (dirty: boolean) => useLibraryDraft.setState({ dirty });

/**
 * Library: browse styles and charts, type a chart as text, hear it, save it. User charts
 * live in ~/JosefinesJamstudio/charts and can shadow bundled ones with the same id.
 */
export const Library: React.FC = () => {
  const {
    styles,
    charts,
    currentChart,
    libraryInfo,
    styleId,
    currentBar,
    barProgress,
    loopEnabled,
    loopStartBar,
    loopEndBar,
    isPreview,
    bandLoadChart,
    bandSetStyle,
    playChartInline,
    saveChart,
    deleteUserChart,
    reloadLibrary,
    transportSeekBar,
    transportSetLoop,
    notify,
  } = useEngineStore(
    useShallow((s) => ({
      styles: s.styles,
      charts: s.charts,
      currentChart: s.currentChart,
      libraryInfo: s.libraryInfo,
      styleId: s.telemetry.band.style_id,
      currentBar: s.telemetry.transport.bar,
      barProgress: s.telemetry.transport.bar_progress,
      loopEnabled: s.telemetry.transport.loop_enabled,
      loopStartBar: s.telemetry.transport.loop_start_bar,
      loopEndBar: s.telemetry.transport.loop_end_bar,
      isPreview: s.isPreview,
      bandLoadChart: s.bandLoadChart,
      bandSetStyle: s.bandSetStyle,
      playChartInline: s.playChartInline,
      saveChart: s.saveChart,
      deleteUserChart: s.deleteUserChart,
      reloadLibrary: s.reloadLibrary,
      transportSeekBar: s.transportSeekBar,
      transportSetLoop: s.transportSetLoop,
      notify: s.notify,
    })),
  );

  const { text, editingId, dirty } = useLibraryDraft();
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("All charts");
  useEffect(() => {
    if (text === null && currentChart) {
      const baseline = chartToText(currentChart);
      useLibraryDraft.setState({
        text: baseline,
        baseline,
        editingId: currentChart.id,
      });
    }
  }, [currentChart, text]);

  const parsed = useMemo(() => parseChartText(text ?? ""), [text]);
  const draft = parsed.chart;
  const bars = draft ? resolveChart(draft) : [];
  const beatsTotal = bars.reduce(
    (sum, b) => sum + b.chords.reduce((s, c) => s + c.beats, 0),
    0,
  );
  const durationSecs = draft ? (beatsTotal * 60) / draft.defaultBpm : 0;
  const userIds = useMemo(
    () => new Set(libraryInfo?.userChartIds ?? []),
    [libraryInfo],
  );
  const isUserChart = (c: Chart) => userIds.has(c.id);

  const visibleCharts = charts.filter(
    (c) =>
      (collection === "All charts" ||
        (collection === "Your charts") === isUserChart(c)) &&
      `${c.name} ${keyName(c.keyTonic, c.mode)} ${c.defaultBpm}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const openChart = (chart: Chart) => {
    if (dirty) return;
    useLibraryDraft.setState({ baseline: chartToText(chart) });
    setText(chartToText(chart));
    setEditingId(chart.id);
    setDirty(false);
  };

  const play = async () => {
    if (!draft || parsed.problems.length) {
      notify("error", "Fix the chart problems before playing it.");
      return;
    }
    await playChartInline(draft);
  };

  const save = async () => {
    if (!draft || parsed.problems.length) {
      notify("error", "Fix the chart problems before saving.");
      return;
    }
    const path = await saveChart(draft);
    if (path !== null) {
      useLibraryDraft.setState((current) => ({
        baseline: text ?? "",
        dirty: current.text !== text,
        editingId: draft.id,
      }));
    }
  };

  const transposeDraft = (semis: number) => {
    if (!draft || parsed.problems.length) return;
    setText(chartToText(transposeChart(draft, semis)));
    setDirty(true);
  };

  const onEditorKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void play();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
    }
  };

  return (
    <div className="library-workspace flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <WorkspaceHeader
        screen="library"
        title="Find the feel. Make it yours."
        description="Browse chord charts and band grooves. Edit a chart, then play it on Stage."
      />
      <div className="workspace-search">
        <label>
          Search
          <input
            type="search"
            aria-label="Search charts and grooves"
            placeholder="Title, key, genre or tempo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Chart collection"
          value={collection}
          onChange={(e) => setCollection(e.target.value)}
        >
          <option>All charts</option>
          <option>Your charts</option>
          <option>Bundled charts</option>
        </select>
        <Button onClick={() => useEngineStore.getState().setScreen("stage")}>
          Go to Stage
        </Button>
      </div>
      {dirty && (
        <div className="workspace-actions">
          <p className="workspace-note">
            Your draft stays here when you change rooms. Save or discard it
            before opening another chart.
          </p>
          <Button
            size="sm"
            onClick={() =>
              useLibraryDraft.setState({
                text: useLibraryDraft.getState().baseline,
                dirty: false,
              })
            }
          >
            Discard draft changes
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-6">
        {/* Left: charts and styles */}
        <div className="flex flex-col gap-6 min-w-0">
          <Panel title={`Charts (${visibleCharts.length} of ${charts.length})`}>
            {!visibleCharts.length && (
              <p className="workspace-note py-4">
                No charts match. Try another search or collection.
              </p>
            )}
            <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto pr-1">
              {visibleCharts.map((c) => {
                const active = currentChart?.id === c.id;
                const editing = editingId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 rounded-[var(--radius-m)] border px-2.5 py-1.5 ${
                      active
                        ? "bg-[var(--accent-soft)] border-[var(--accent)]"
                        : "bg-[var(--bg-2)] border-[var(--line)]"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left cursor-pointer min-w-0"
                      disabled={dirty}
                      onClick={() => openChart(c)}
                      title="Open in the editor"
                    >
                      <div className="text-sm text-[var(--fg-0)] truncate">
                        {c.name}
                        {editing && (
                          <span className="text-[var(--fg-2)]"> · editing</span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--fg-2)]">
                        {keyName(c.keyTonic, c.mode)} · {c.timeSig[0]}/
                        {c.timeSig[1]} · {Math.round(c.defaultBpm)} BPM ·{" "}
                        {resolveChart(c).length} bars
                        {isUserChart(c) ? " · yours" : ""}
                      </div>
                    </button>
                    <Button
                      size="sm"
                      variant={active ? "primary" : "secondary"}
                      onClick={() => bandLoadChart(c.id)}
                      title="Load into the band (adopts its tempo and style)"
                    >
                      {active ? "Loaded" : "Load"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                disabled={dirty}
                onClick={() => {
                  useLibraryDraft.setState({ baseline: TEMPLATE });
                  setText(TEMPLATE);
                  setEditingId(null);
                  setDirty(true);
                }}
              >
                New chart
              </Button>
              <Button size="sm" variant="ghost" onClick={() => reloadLibrary()}>
                Reload folder
              </Button>
            </div>
            {libraryInfo && (
              <p className="text-[10px] font-mono text-[var(--fg-2)] mt-2 break-all">
                Your charts: {libraryInfo.chartsDir}
                <br />
                Your styles: {libraryInfo.stylesDir}
              </p>
            )}
          </Panel>

          <Panel title={`Styles (${styles.length})`}>
            <div className="flex flex-col gap-1">
              {styles
                .filter((s) =>
                  `${s.name} ${s.genre} ${s.feel.bpmRange.join(" ")}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((s) => {
                  const active = styleId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => bandSetStyle(s.id)}
                      className={`text-left rounded-[var(--radius-m)] border px-2.5 py-1.5 cursor-pointer transition-colors ${
                        active
                          ? "bg-[var(--accent-soft)] border-[var(--accent)]"
                          : "bg-[var(--bg-2)] border-[var(--line)] hover:bg-[var(--bg-3)]"
                      }`}
                    >
                      <div className="text-sm text-[var(--fg-0)]">{s.name}</div>
                      <div className="text-[10px] font-mono text-[var(--fg-2)]">
                        {s.genre} · {s.feel.timeSig[0]}/{s.feel.timeSig[1]} ·{" "}
                        {Math.round(s.feel.bpmRange[0])}–
                        {Math.round(s.feel.bpmRange[1])} BPM
                        {s.feel.swing > 0.55 ? " · swung" : ""}
                      </div>
                    </button>
                  );
                })}
            </div>
            <p className="text-[10px] font-mono text-[var(--fg-2)] mt-3">
              Styles are JSON files. Drop your own into the styles folder and
              reload; no code needed.
            </p>
          </Panel>
        </div>

        {/* Right: editor */}
        <div className="flex flex-col gap-4 min-w-0">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs uppercase tracking-wider font-mono text-[var(--fg-2)]">
                  Chart editor
                </h3>
                {draft ? (
                  <StatusPill
                    status={parsed.problems.length === 0 ? "ok" : "live"}
                    label={
                      parsed.problems.length === 0
                        ? `${bars.length} bars · ${formatDuration(durationSecs)}`
                        : `${parsed.problems.length} note${parsed.problems.length > 1 ? "s" : ""}`
                    }
                  />
                ) : (
                  <StatusPill status="error" label="Not playable yet" />
                )}
                {dirty && (
                  <span className="text-[10px] font-mono text-[var(--fg-2)]">
                    unsaved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => transposeDraft(-1)}
                  title="Down a semitone"
                >
                  ♭ −1
                </Button>
                <Button
                  size="sm"
                  onClick={() => transposeDraft(1)}
                  title="Up a semitone"
                >
                  ♯ +1
                </Button>
                <div className="h-4 w-px bg-[var(--line)]" />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={play}
                  disabled={!draft || parsed.problems.length > 0}
                  title="Ctrl/Cmd+Enter"
                >
                  Play this
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={!draft || parsed.problems.length > 0}
                  title="Ctrl/Cmd+S"
                >
                  Save
                </Button>
                {editingId && userIds.has(editingId) && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await deleteUserChart(editingId);
                      setEditingId(null);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>

            <textarea
              aria-label="Chart editor"
              value={text ?? ""}
              onChange={(e) => {
                setText(e.target.value);
                setDirty(true);
              }}
              onKeyDown={onEditorKey}
              spellCheck={false}
              rows={16}
              className="w-full bg-[var(--bg-0)] border border-[var(--line)] rounded-[var(--radius-m)] p-3 font-mono text-sm text-[var(--fg-0)] leading-relaxed resize-y focus:outline-none focus:border-[var(--accent)]"
              placeholder={TEMPLATE}
            />

            {parsed.problems.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {parsed.problems.map((p) => (
                  <li
                    key={`${p.line}-${p.message}`}
                    className="text-xs font-mono text-[var(--record)]"
                  >
                    line {p.line}: {p.message}
                  </li>
                ))}
              </ul>
            )}

            <details className="mt-3 text-xs font-mono text-[var(--fg-2)]">
              <summary className="cursor-pointer text-[var(--fg-1)]">
                How to write a chart
              </summary>
              <div className="mt-2 space-y-1 leading-relaxed">
                <p>
                  <code># Title</code>, then <code>key: A major</code>,{" "}
                  <code>time: 4/4</code>, <code>bpm: 110</code>,{" "}
                  <code>style: blues-shuffle</code>.
                </p>
                <p>
                  <code>[Chorus x2]</code> starts a section that plays twice.
                  Bars go between <code>|</code> pipes. Two chords in a bar
                  split it evenly (<code>| Dm7 G7 |</code>); give beats
                  explicitly with <code>Am7:3 D7:1</code>. <code>%</code>{" "}
                  repeats the last bar.
                </p>
                <p>
                  <code>arrangement: verse x2, bridge, verse</code> overrides
                  the play order.
                </p>
              </div>
            </details>
          </Panel>

          <Panel title="Preview of the form">
            <ChordStrip
              chart={draft}
              currentBar={
                currentChart &&
                draft &&
                chartToText(currentChart) === chartToText(draft)
                  ? currentBar
                  : 0
              }
              barProgress={barProgress}
              loop={{
                enabled: loopEnabled,
                startBar: loopStartBar,
                endBar: loopEndBar,
              }}
              onSeek={(bar) => {
                if (
                  draft &&
                  currentChart &&
                  chartToText(draft) === chartToText(currentChart)
                )
                  void transportSeekBar(bar);
                else
                  notify("info", "Play this chart before seeking in its form.");
              }}
              onSetLoop={(a, b) => {
                if (
                  draft &&
                  currentChart &&
                  chartToText(draft) === chartToText(currentChart)
                )
                  void transportSetLoop(a, b, true);
                else notify("info", "Play this chart before setting its loop.");
              }}
              compact
            />
            {isPreview && (
              <p className="text-[10px] font-mono text-[var(--fg-2)] mt-1">
                Browser preview: saving keeps the chart for this session only.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
};

function formatDuration(secs: number): string {
  const rounded = Math.round(secs);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
