import { expect, it } from "vitest";
import { withNextStep } from "../../src/lib/loudError";
import { useEngineStore } from "../../src/store/engine";

it("leaves an error that already names the next step", () => {
  const message = "Recording was interrupted. Save the partial take.";
  expect(withNextStep(message)).toBe(message);
  expect(
    withNextStep(
      "Music.ai analysis is not configured. Add a Music.ai key in Settings.",
    ),
  ).toContain("Add a Music.ai key in Settings.");
});

it("adds a concrete next step when the loud error has none", () => {
  expect(withNextStep("Disk unavailable")).toMatch(/Free disk space/);
  const audio = withNextStep(
    "The output audio device failed. device gone. Running headless.",
  );
  expect(audio).toMatch(/Audio devices/);
  expect(audio).toMatch(/connected interfaces for input and output/);
  expect(audio).not.toMatch(/same interface/);
  expect(withNextStep("The bundled styles could not load. bad json")).toMatch(
    /Open Library/,
  );
  expect(withNextStep("Could not save the usage log. access denied")).toMatch(
    /JosefinesJamstudio/,
  );
  expect(withNextStep("Live updates are unavailable. timeout")).toMatch(
    /First run/,
  );
  expect(withNextStep('Load chart: unknown chart "x"')).toMatch(
    /Pick a listed chart/,
  );
  expect(withNextStep("The rig control failed. CC 200 is above 127")).toMatch(
    /0 to 127/,
  );
  expect(withNextStep("Microphone unavailable")).toMatch(
    /Open the voice setup/,
  );
  expect(withNextStep("No speech was detected. Check your microphone.")).toBe(
    "No speech was detected. Check your microphone.",
  );
});

it("toasts go through the same next-step helper", () => {
  const previous = useEngineStore.getState();
  try {
    useEngineStore.getState().notify("error", "Disk unavailable");
    expect(useEngineStore.getState().notices.at(-1)?.text).toMatch(
      /Free disk space/,
    );
    useEngineStore
      .getState()
      .notify("error", "Recording was interrupted. Save the partial take.");
    expect(useEngineStore.getState().notices.at(-1)?.text).toBe(
      "Recording was interrupted. Save the partial take.",
    );
    useEngineStore.getState().notify("info", "Saved Blues");
    expect(useEngineStore.getState().notices.at(-1)?.text).toBe("Saved Blues");
  } finally {
    useEngineStore.setState(previous, true);
  }
});
