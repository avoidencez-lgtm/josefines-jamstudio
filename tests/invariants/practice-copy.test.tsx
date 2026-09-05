import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { useMedia } from "../../src/lib/media";
import { Songs } from "../../src/screens/Songs";

it("offers bounded practice controls beside a real library selection and keeps preview disabled", () => {
  const initial = useMedia.getInitialState();
  const assets = initial.assets;
  initial.assets = [
    {
      id: "reference",
      kind: "audio",
      label: "Synthetic reference",
      path: "reference.wav",
      seconds: 2,
    },
  ];
  try {
    const html = renderToStaticMarkup(createElement(Songs));
    expect(html).toContain("Make a practice copy");
    expect(html).toContain('aria-label="Practice speed"');
    expect(html).toContain('min="50" max="150"');
    expect(html).toContain('value="-12"');
    expect(html).toContain('value="12"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create practice copy/);
    expect(html).not.toContain("<audio");
  } finally {
    initial.assets = assets;
  }
});
