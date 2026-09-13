import type { Chart } from "../../ipc/contract";

/** Rehearsal loops in arranged order, one per form entry, including repeats. */
export function sectionPassages(chart: Chart | null) {
  let start = 1;
  return (chart?.arrangement ?? []).flatMap((a) => {
    const section = chart?.sections.find((s) => s.id === a.sectionId);
    if (!section) return [];
    // Transport loops use a one-based, exclusive end bar.
    const end = start + section.bars.length * a.repeats;
    const passage = { label: section.name, start, end };
    start = end;
    return [passage];
  });
}

/** Current form passage, the next label, and bars remaining until that change. */
export function sectionCue(chart: Chart | null, bar: number) {
  const passages = sectionPassages(chart);
  const current = passages.find((p) => bar >= p.start && bar < p.end);
  if (!current)
    return {
      current: null as string | null,
      next: passages[0]?.label ?? null,
      barsUntil: null as number | null,
    };
  const next = passages[passages.indexOf(current) + 1] ?? null;
  return {
    current: current.label,
    next: next?.label ?? null,
    barsUntil: next ? current.end - bar : null,
  };
}
