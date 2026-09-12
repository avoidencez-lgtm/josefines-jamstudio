import { create } from "zustand";
import type { Chart } from "../ipc/contract";

/** The chart editor draft survives navigation to Stage or Settings; files stay the saved truth. */
export const useLibraryDraft = create<{
  text: string | null;
  baseline: string;
  editingId: string | null;
  source: Chart | null;
  dirty: boolean;
}>(() => ({
  text: null,
  baseline: "",
  editingId: null,
  source: null,
  dirty: false,
}));
