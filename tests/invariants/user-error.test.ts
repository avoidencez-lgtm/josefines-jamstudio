import { expect, it } from "vitest";
import { z } from "zod";
import { readPreferences } from "../../src/lib/jo/providers";
import { readIdea } from "../../src/lib/jo/songLab";
import { applyShotIdeas, newVideo } from "../../src/lib/media";
import {
  parseJson,
  parseSchema,
  userFacingError,
} from "../../src/lib/userError";

it("turns Zod and JSON failures into a next step, not a dump", () => {
  const prefs = readPreferences(null);
  const zeroTokens = {
    ...prefs,
    models: {
      ...prefs.models,
      gemini: { ...prefs.models.gemini, maxTokens: 0 },
    },
  };
  expect(() => readPreferences(zeroTokens)).toThrow(/256 and 4096/);
  try {
    readPreferences(zeroTokens);
  } catch (error) {
    expect(userFacingError(error)).not.toMatch(/ZodError|too_small|\[\{/);
    expect(String(error)).not.toMatch(/ZodError/);
  }

  expect(() => parseJson("{")).toThrow(/valid JSON/);
  expect(userFacingError(new SyntaxError("Unexpected token"))).toMatch(
    /valid JSON/,
  );
  try {
    z.object({ title: z.string().min(1) }).parse({ title: "" });
  } catch (error) {
    expect(userFacingError(error)).toMatch(/title/);
    expect(userFacingError(error)).not.toMatch(/ZodError/);
  }

  expect(() => applyShotIdeas(newVideo(), "{")).toThrow(/valid JSON/);
  expect(() => readIdea("not-json", "lyrics")).toThrow(/valid JSON/);
  expect(parseSchema(z.string().min(1), "ok")).toBe("ok");
});
