import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MEDIA_MODELS } from "../../src/lib/media";
import { MusicVideo } from "../../src/screens/MusicVideo";
import { useEngineStore } from "../../src/store/engine";

vi.mock("../../src/ipc/client", () => ({
  isPreview: false,
  ipc: { invoke: vi.fn(), listen: vi.fn() },
}));

it("offers native audio generation without FFmpeg while retaining provider-key and recording guards", () => {
  const engine = useEngineStore.getInitialState();
  const before = {
    keysPresent: engine.keysPresent,
    isRecording: engine.isRecording,
  };
  const provider = MEDIA_MODELS.find((m) => m.id === "lyria")?.provider;
  if (!provider) throw new Error("Missing audio model fixture");
  try {
    engine.keysPresent = { [provider]: true };
    engine.isRecording = false;
    const html = renderToStaticMarkup(
      createElement(MusicVideo, { audioOnly: true }),
    );
    expect(html).toContain("Generate song · uses API credits");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Generate song/);
    expect(html).toContain("Generated audio is saved and analyzed locally");
    expect(html).toContain('class="video-note" hidden=""');
    engine.isRecording = true;
    expect(
      renderToStaticMarkup(createElement(MusicVideo, { audioOnly: true })),
    ).toMatch(/<button[^>]*disabled=""[^>]*>Generate song/);
    engine.isRecording = false;
    engine.keysPresent = {};
    expect(
      renderToStaticMarkup(createElement(MusicVideo, { audioOnly: true })),
    ).toMatch(/<button[^>]*disabled=""[^>]*>Generate song/);
  } finally {
    Object.assign(engine, before);
  }
});
