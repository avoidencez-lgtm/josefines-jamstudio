import { afterEach, expect, it } from "vitest";
import { type PreviewEngine, createPreviewEngine } from "../../src/ipc/preview";
import review from "../fixtures/providers/review/take-review.json";

let engine: PreviewEngine | undefined;
afterEach(() => engine?.dispose());

it("reviews from analysis numbers and stays not configured in preview", async () => {
  expect(review.fromAudio).toBe(false);
  expect(review.origin).toBe("synthetic-analysis");
  engine = createPreviewEngine({ autoTick: false });
  await expect(engine.invoke("takes_review", { takeId: "x" })).rejects.toThrow(
    /not configured/,
  );
});
