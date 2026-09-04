import { X } from "@phosphor-icons/react";
import type React from "react";
import { useEngineStore } from "../store/engine";

/** Toast rail for engine errors and confirmations. Bottom-left so it never covers Jo. */
export const Notices: React.FC = () => {
  const notices = useEngineStore((s) => s.notices);
  const dismiss = useEngineStore((s) => s.dismissNotice);
  if (notices.length === 0) return null;
  return (
    <div className="fixed bottom-6 left-[96px] z-40 flex flex-col gap-2 max-w-md">
      {notices.map((n) => (
        <output
          key={n.id}
          className={`flex items-start gap-3 px-3 py-2 rounded-[var(--radius-m)] border shadow-[var(--shadow)] text-xs font-mono ${
            n.kind === "error"
              ? "bg-[rgba(224,83,78,0.12)] border-[var(--record)] text-[var(--fg-0)]"
              : "bg-[var(--bg-1)] border-[var(--line)] text-[var(--fg-0)]"
          }`}
        >
          <span className="flex-1 break-words">{n.text}</span>
          <button
            type="button"
            onClick={() => dismiss(n.id)}
            className="text-[var(--fg-2)] hover:text-[var(--fg-0)] cursor-pointer"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </output>
      ))}
    </div>
  );
};
