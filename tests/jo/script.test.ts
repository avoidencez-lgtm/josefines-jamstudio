/**
 * M2 Jo script: mocked STT transcripts plus recorded Gemini fixtures.
 * ≥27 of 30 utterances must yield the expected tool calls. No network.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { JoToolCall } from "../../src/lib/jo/persona";
import { BRAINS } from "../../src/lib/jo/providers";

const root = dirname(fileURLToPath(import.meta.url));
const script = JSON.parse(
  readFileSync(join(root, "../fixtures/jo/script.json"), "utf8"),
) as {
  minCorrect: number;
  utterances: { id: string; stt: string; expected: JoToolCall[] }[];
};
const fixtures = JSON.parse(
  readFileSync(
    join(root, "../fixtures/providers/gemini/jo-script.json"),
    "utf8",
  ),
) as Record<string, unknown>;

describe("Jo 30-utterance script (mocked STT, recorded Gemini)", () => {
  it("covers thirty transcripts and scores at least 27 against the fixtures", () => {
    expect(script.utterances).toHaveLength(30);
    expect(new Set(script.utterances.map((u) => u.id))).toEqual(
      new Set(Object.keys(fixtures)),
    );
    let correct = 0;
    const misses: string[] = [];
    for (const utterance of script.utterances) {
      expect(utterance.stt.trim().length).toBeGreaterThan(0);
      const fixture = fixtures[utterance.id];
      expect(fixture, utterance.id).toBeTruthy();
      try {
        const { toolCalls } = BRAINS.gemini.read(fixture);
        expect(toolCalls).toEqual(utterance.expected);
        correct += 1;
      } catch (error) {
        misses.push(`${utterance.id}: ${String(error)}`);
      }
    }
    expect(
      correct,
      `need ≥${script.minCorrect}/30, got ${correct}. ${misses.join("; ")}`,
    ).toBeGreaterThanOrEqual(script.minCorrect);
  });
});
