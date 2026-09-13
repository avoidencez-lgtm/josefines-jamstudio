import {
  type ReactElement,
  type ReactNode,
  createElement,
  isValidElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { newOriginal, useWriting } from "../../src/lib/originals";

afterEach(() => {
  vi.unstubAllGlobals();
  useWriting.setState(useWriting.getInitialState(), true);
});

type ButtonEl = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function findButtons(node: ReactNode, label: string): ButtonEl[] {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node))
    return node.flatMap((child) => findButtons(child, label));
  if (!isValidElement(node)) return [];
  const el = node as ButtonEl;
  const hit = el.props.children === label ? [el] : [];
  return [...hit, ...findButtons(el.props.children, label)];
}

it("shows the copy-song escape hatch after a child throws once and Retry remounts", () => {
  const song = newOriginal();
  useWriting.setState({ song });
  let fail = true;
  function Boom() {
    if (fail) throw new Error("This room failed to render.");
    return createElement("p", null, "This room is open.");
  }
  const boundary = new ErrorBoundary({ children: createElement(Boom) });
  try {
    renderToStaticMarkup(createElement(Boom));
    throw new Error("expected the child to throw");
  } catch (error) {
    expect((error as Error).message).toBe("This room failed to render.");
    boundary.state = {
      ...boundary.state,
      ...ErrorBoundary.getDerivedStateFromError(error as Error),
    };
  }
  boundary.setState = ((update) => {
    const partial =
      typeof update === "function"
        ? update(boundary.state, boundary.props)
        : update;
    if (partial) boundary.state = { ...boundary.state, ...partial };
  }) as typeof boundary.setState;

  const fallback = boundary.render() as ReactElement;
  const html = renderToStaticMarkup(fallback);
  expect(html).toContain("Copy this unsaved song JSON");
  expect(html).toContain("Retry");
  expect(html).toContain(
    "This room could not render. Copy the unsaved song JSON, then Retry.",
  );

  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const copy = findButtons(fallback, "Copy this unsaved song JSON")[0];
  expect(copy).toBeDefined();
  copy.props.onClick?.();
  expect(writeText).toHaveBeenCalledWith(JSON.stringify(song));

  useWriting.setState({ song: null });
  copy.props.onClick?.();
  expect(writeText).toHaveBeenCalledWith("No unsaved song.");

  fail = false;
  const retry = findButtons(fallback, "Retry")[0];
  expect(retry).toBeDefined();
  retry.props.onClick?.();
  expect(renderToStaticMarkup(boundary.render() as ReactElement)).toContain(
    "This room is open.",
  );
});
