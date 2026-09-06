import type { StyleSummary } from "../../ipc/contract";
import { useEngineStore } from "../../store/engine";
import type { JoToolCall } from "./persona";

const FALLBACK = "I didn't catch that — try 'blues in A at 90'.";

const bundledStyleModules = import.meta.glob("../../../styles/*.json", {
  eager: true,
}) as Record<string, { default: StyleSummary }>;

export type StyleHint = Pick<StyleSummary, "id" | "name" | "genre" | "feel">;

/** Live library when the engine has loaded; bundled styles otherwise. No id table. */
export function listedStyles(override?: StyleHint[]): StyleHint[] {
  if (override?.length) return override;
  const live = useEngineStore.getState().styles;
  if (live.length) return live;
  return Object.values(bundledStyleModules).map((m) => m.default);
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentioned(lower: string, needle: string): boolean {
  if (needle.length < 3) return false;
  if (lower.includes(needle)) return true;
  return new RegExp(`\\b${escapeRe(needle)}[a-z]+\\b`).test(lower);
}

function styleNeedles(style: StyleHint): string[] {
  const needles = [
    style.id.replaceAll("-", " "),
    style.name.toLowerCase(),
    style.genre.toLowerCase(),
    ...style.id.split("-").filter((part) => part.length >= 4),
  ];
  const [beats, note] = style.feel.timeSig;
  if (beats !== 4 || note !== 4) needles.push(`${beats}/${note}`);
  return [...new Set(needles.filter((n) => n.length >= 3))];
}

function matchStyle(lower: string, styles: StyleHint[]): StyleHint | undefined {
  let best: { style: StyleHint; score: number } | undefined;
  for (const style of styles) {
    for (const needle of styleNeedles(style)) {
      if (!mentioned(lower, needle)) continue;
      if (!best || needle.length > best.score)
        best = { style, score: needle.length };
    }
  }
  return best?.style;
}

function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  return /^(what|why|how|when|where|who|which|should|is|are|do|does|did|can we)\b/i.test(
    t,
  );
}

export function parseNaturalIntent(
  text: string,
  styles?: StyleHint[],
): {
  reply: string;
  toolCalls: JoToolCall[];
} {
  const lower = text.toLowerCase().trim();
  const catalog = listedStyles(styles);
  if (isQuestion(text)) return { reply: FALLBACK, toolCalls: [] };

  if (lower === "next section")
    return {
      reply: "Moving to the next section.",
      toolCalls: [{ name: "songwriting", arguments: { action: "next" } }],
    };
  const rehearsal =
    /^(?:loop|practice) (?:the )?(verse|chorus|bridge|solo|intro|outro|section)$/.exec(
      lower,
    );
  if (rehearsal)
    return {
      reply: "Looping the section.",
      toolCalls: [
        {
          name: "songwriting",
          arguments: {
            action: "loop",
            name: rehearsal[1] === "section" ? "" : rehearsal[1],
          },
        },
      ],
    };

  if (/^(jo[, ]+)?keep (that|what i just played)[.!]?$/.test(lower))
    return {
      reply: "Keeping the idea.",
      toolCalls: [{ name: "songwriting", arguments: { action: "keep" } }],
    };
  if (lower === "save song")
    return {
      reply: "Saving the song.",
      toolCalls: [{ name: "songwriting", arguments: { action: "save" } }],
    };
  if (lower === "undo that" || lower === "undo")
    return {
      reply: "Undoing the last song edit.",
      toolCalls: [{ name: "songwriting", arguments: { action: "undo" } }],
    };
  const version =
    /^(?:keep|save)(?: this as)? (?:a )?version(?: called)? (.+)$/.exec(lower);
  if (version)
    return {
      reply: "Keeping this version.",
      toolCalls: [
        {
          name: "songwriting",
          arguments: { action: "version", name: version[1] },
        },
      ],
    };
  const lock = /^(lock|unlock|keep) (?:the )?(drums|bass|comp)$/.exec(lower);
  if (lock)
    return {
      reply: "Updating the part lock.",
      toolCalls: [
        {
          name: "songwriting",
          arguments: {
            action: "lock",
            part: lock[2],
            locked: lock[1] !== "unlock",
          },
        },
      ],
    };

  if (
    lower.includes("record a take") ||
    lower.includes("start recording") ||
    lower === "record"
  ) {
    return {
      reply: "Recording take! Make it count.",
      toolCalls: [{ name: "record_take", arguments: { action: "start" } }],
    };
  }
  if (lower.includes("stop recording") || lower.includes("save take")) {
    return {
      reply: "Take recorded and saved to your session library.",
      toolCalls: [{ name: "record_take", arguments: { action: "stop" } }],
    };
  }

  const style = matchStyle(lower, catalog);
  if (style)
    return {
      reply: `Switching to ${style.name}.`,
      toolCalls: [{ name: "set_style", arguments: { styleId: style.id } }],
    };

  if (
    /\bdrum fill\b/.test(lower) ||
    /\b(?:give me|play|trigger) (?:a )?(?:drum )?fill\b/.test(lower) ||
    /^fill[.!]?$/.test(lower)
  ) {
    return {
      reply: "Drum fill coming up at the next bar!",
      toolCalls: [{ name: "trigger_cue", arguments: { cue: "fill" } }],
    };
  }
  if (/\bcrash\b/.test(lower) && !/\bcrash cymbal setup\b/.test(lower)) {
    return {
      reply: "Crashing at next bar downbeat!",
      toolCalls: [{ name: "trigger_cue", arguments: { cue: "crash" } }],
    };
  }
  if (
    lower.includes("ending") ||
    lower.includes("end it") ||
    lower.includes("bring it home")
  ) {
    return {
      reply: "Leading the ending at the next bar boundary.",
      toolCalls: [{ name: "trigger_cue", arguments: { cue: "ending" } }],
    };
  }

  if (
    lower.includes("drop the bass") ||
    lower.includes("mute bass") ||
    lower.includes("no bass")
  ) {
    return {
      reply: "Dropping the bass out.",
      toolCalls: [{ name: "set_parts", arguments: { muteBass: true } }],
    };
  }
  if (lower.includes("bring in bass") || lower.includes("unmute bass")) {
    return {
      reply: "Bringing the bass back in.",
      toolCalls: [{ name: "set_parts", arguments: { muteBass: false } }],
    };
  }
  if (
    lower.includes("drop drums") ||
    lower.includes("no drums") ||
    lower.includes("mute drums")
  ) {
    return {
      reply: "Muting drums.",
      toolCalls: [{ name: "set_parts", arguments: { muteDrums: true } }],
    };
  }
  if (lower.includes("bring in drums") || lower.includes("unmute drums")) {
    return {
      reply: "Drums back in.",
      toolCalls: [{ name: "set_parts", arguments: { muteDrums: false } }],
    };
  }

  if (
    lower.includes("follow my energy") ||
    lower.includes("follow dynamics") ||
    lower.includes("energy following on")
  ) {
    return {
      reply: "I'm listening to your guitar dynamics and matching your energy.",
      toolCalls: [
        {
          name: "toggle_energy_follower",
          arguments: { enabled: true },
        },
      ],
    };
  }

  const bpmMatch =
    lower.match(/(\d{2,3})\s*bpm/) ||
    lower.match(/tempo\s*(?:to|at)?\s*(\d{2,3})/);
  if (bpmMatch) {
    const bpm = Number.parseInt(bpmMatch[1], 10);
    return {
      reply: `Setting tempo to ${bpm} BPM.`,
      toolCalls: [{ name: "set_tempo", arguments: { bpm } }],
    };
  }
  if (
    lower.includes("faster") ||
    lower.includes("pick it up") ||
    lower.includes("speed up")
  ) {
    return {
      reply: "Pushing the tempo up 5 BPM.",
      toolCalls: [{ name: "set_tempo", arguments: { delta: 5 } }],
    };
  }
  if (
    lower.includes("slower") ||
    lower.includes("slow down") ||
    lower.includes("drag it")
  ) {
    return {
      reply: "Pulling back the tempo by 5 BPM.",
      toolCalls: [{ name: "set_tempo", arguments: { delta: -5 } }],
    };
  }

  if (
    /^(?:jo[, ]+)?(?:can you |please )?(?:play|start)\b/.test(lower) ||
    /\blet'?s (?:jam|play)\b/.test(lower) ||
    lower === "go"
  ) {
    return {
      reply: "Let's roll! 1, 2, 3, 4...",
      toolCalls: [
        {
          name: "transport_control",
          arguments: { action: "play" },
        },
      ],
    };
  }
  if (lower.includes("pause") || lower.includes("hold on")) {
    return {
      reply: "Pausing. Whenever you're ready.",
      toolCalls: [
        {
          name: "transport_control",
          arguments: { action: "pause" },
        },
      ],
    };
  }
  if (
    /^(?:jo[, ]+)?(?:can you |please )?(?:stop|kill)(?:\s|$|[.!])/.test(
      lower,
    ) ||
    /\bcut it\b/.test(lower)
  ) {
    return {
      reply: "Stopping playback.",
      toolCalls: [
        {
          name: "transport_control",
          arguments: { action: "stop" },
        },
      ],
    };
  }

  return { reply: FALLBACK, toolCalls: [] };
}
