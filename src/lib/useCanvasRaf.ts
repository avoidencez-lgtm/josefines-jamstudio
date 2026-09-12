import { useEffect, useRef } from "react";
import { canvasRafShouldRun } from "./meterFps";

/** One rAF loop that stops when `live` is false or the document is hidden. */
export function useCanvasRaf(live: boolean, frame: () => void): void {
  const frameRef = useRef(frame);
  frameRef.current = frame;
  useEffect(() => {
    let id = 0;
    const tick = () => {
      frameRef.current();
      if (canvasRafShouldRun(live, document.hidden)) {
        id = requestAnimationFrame(tick);
      } else {
        id = 0;
      }
    };
    const kick = () => {
      if (id) cancelAnimationFrame(id);
      id = 0;
      tick();
    };
    document.addEventListener("visibilitychange", kick);
    kick();
    return () => {
      document.removeEventListener("visibilitychange", kick);
      if (id) cancelAnimationFrame(id);
    };
  }, [live]);
}
