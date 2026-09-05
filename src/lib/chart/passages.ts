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
