import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProviderEstimates } from "../../src/components/ProviderEstimates";

it("shows the Music.ai not-configured next step and never claims a grid drive", () => {
  const html = renderToStaticMarkup(
    createElement(ProviderEstimates, {
      locked: false,
      song: {
        id: "song",
        kind: "audio",
        label: "Fixture",
        path: "source.wav",
        seconds: 4,
        providerAnalysis: {
          schemaVersion: 1,
          provider: "musicai",
          confidence: "unverified",
          bpm: 120,
          key: "C Major",
          sections: [{ name: "Verse" }],
          drivesGrid: false,
        },
      },
    }),
  );
  expect(html).toContain("not configured");
  expect(html).toContain("JAM_LIVE=1");
  expect(html).toContain("Does not drive the transport grid");
  expect(html).toContain("Confirm this recorded grid.");
  expect(html).toContain("Verse");
});
