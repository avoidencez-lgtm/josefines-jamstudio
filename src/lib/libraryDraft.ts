import { create } from "zustand";

/** The chart editor draft survives navigation to Stage or Settings; files stay the saved truth. */
export const useLibraryDraft = create<{
  text: string | null;
  baseline: string;
  editingId: string | null;
  dirty: boolean;
}>(() => ({ text: null, baseline: "", editingId: null, dirty: false }));
