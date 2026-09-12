import type { JoToolCall } from "./persona";

/** Strip wrap-quotes, a trailing play request, then trailing punctuation. */
export function cleanSongQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^["“]([\s\S]*)["”]$/, "$1")
    .trim()
    .replace(/(?:^|\s+)(?:and play|og spill)\s*$/i, "")
    .trim()
    .replace(/[.!?]+$/u, "")
    .trim();
}

export function parseNaturalIntent(
  text: string,
  reference?: {
    assetId: string;
    speed: number;
    sections?: Array<{ id: string; label: string }>;
  },
): {
  reply: string;
  toolCalls: JoToolCall[];
} {
  const lower = text.toLowerCase().trim();
  const toolCalls: JoToolCall[] = [];
  const reply = "This is understood.";
  const load = /^(?:load song|last(?: inn)? sang(?:en)?)\s+(.+)$/i.exec(
    text.trim(),
  );
  if (load) {
    const query = cleanSongQuery(load[1]);
    if (!query)
      return {
        reply:
          "Use load song followed by its title, or last inn sangen followed by its title.",
        toolCalls: [],
      };
    return {
      reply: "Looking for the song in your local library.",
      toolCalls: [{ name: "load_song", arguments: { query } }],
    };
  }
  // Do not let song titles in questions/negations become legacy style commands.
  if (/\b(?:load song|last(?: inn)? sang(?:en)?)\b/i.test(text))
    return {
      reply:
        "Use load song followed by its title, or last inn sangen followed by its title.",
      toolCalls: [],
    };
  if (/\bramp\b/.test(lower)) {
    const ramp =
      /^ramp (?:fra )?(\d{2,3}) (?:to|til) (\d{2,3}) (?:by|med) (\d{1,2}) (?:every|hver) (\d{1,2}) (?:bars?|takt(?:er)?)[.!]?$/.exec(
        lower,
      );
    const stop = /^(?:stop|stopp) ramp[.!]?$/.test(lower);
    return reference && (ramp || stop)
      ? {
          reply: "Updating the reference practice ramp.",
          toolCalls: [
            {
              name: "ramp",
              arguments: stop
                ? { assetId: reference.assetId, stop: true }
                : {
                    assetId: reference.assetId,
                    startPercent: Number(ramp?.[1]),
                    targetPercent: Number(ramp?.[2]),
                    stepPercent: Number(ramp?.[3]),
                    barsPerStep: Number(ramp?.[4]),
                  },
            },
          ],
        }
      : {
          reply:
            "Load a reference and confirm its bars, then use ramp 75 to 100 by 5 every 4 bars, or stop ramp.",
          toolCalls: [],
        };
  }
  if (reference) {
    const loop = /^(?:loop|gjenta)\s+(.+?)[.!]?$/.exec(lower);
    if (loop) {
      const matches =
        reference.sections?.filter(
          (s) =>
            s.label.toLowerCase() === loop[1] || s.id.toLowerCase() === loop[1],
        ) ?? [];
      if (matches.length !== 1)
        return {
          reply:
            "Choose one unique confirmed section in the reference player. Confirm and name its bars in Songs first if needed.",
          toolCalls: [],
        };
      return {
        reply: "Looping the confirmed reference section.",
        toolCalls: [
          {
            name: "loop_reference_section",
            arguments: { assetId: reference.assetId, sectionId: matches[0].id },
          },
        ],
      };
    }
    const percent =
      /^(?:(?:set|sett) )?(?:speed|hastighet)(?: to| til)?\s+(\d{1,3})\s*(?:%|percent|prosent)?[.!]?$/.exec(
        lower,
      );
    const pitch =
      /^(?:transpose|transponer)(?: to| til)?\s+([+-]?\d{1,2})\s*(?:semitones?|halvtoner?)?[.!]?$/.exec(
        lower,
      );
    const faster = /^(?:a bit )?(faster|speed up|raskere)[.!]?$/.test(lower);
    const slower = /^(?:a bit )?(slower|slow down|saktere)[.!]?$/.test(lower);
    if (percent || pitch || faster || slower) {
      const arguments_: Record<string, unknown> = {
        assetId: reference.assetId,
      };
      if (pitch) arguments_.semitones = Number(pitch[1]);
      else
        arguments_.speedPercent = percent
          ? Number(percent[1])
          : Math.max(
              50,
              Math.min(
                150,
                Math.round(reference.speed * 100) + (faster ? 5 : -5),
              ),
            );
      return {
        reply: "Updating reference practice settings.",
        toolCalls: [{ name: "set_reference_practice", arguments: arguments_ }],
      };
    }
  }
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
  // 1. Recording takes (highest priority so "stop recording" isn't caught by generic "stop")
  if (
    lower.includes("record a take") ||
    lower.includes("start recording") ||
    lower === "record"
  ) {
    toolCalls.push({ name: "record_take", arguments: { action: "start" } });
    return { reply: "Recording the take.", toolCalls };
  }
  if (lower.includes("stop recording") || lower.includes("save take")) {
    toolCalls.push({ name: "record_take", arguments: { action: "stop" } });
    return {
      reply: "Take recorded and saved to your session library.",
      toolCalls,
    };
  }

  // 2. Styles (e.g. "play some funk" shouldn't just trigger generic "play")
  if (lower.includes("shuffle") || lower.includes("blues shuffle")) {
    toolCalls.push({
      name: "set_style",
      arguments: { styleId: "blues-shuffle" },
    });
    return { reply: "Switching to Blues Shuffle.", toolCalls };
  }
  if (lower.includes("funk") || lower.includes("funky")) {
    toolCalls.push({ name: "set_style", arguments: { styleId: "funk-16" } });
    return { reply: "Locking in the 16th-note funk groove.", toolCalls };
  }
  if (lower.includes("jazz") || lower.includes("swing")) {
    toolCalls.push({ name: "set_style", arguments: { styleId: "jazz-swing" } });
    return { reply: "Stepping into Jazz Swing.", toolCalls };
  }
  if (
    lower.includes("metal") ||
    lower.includes("gallop") ||
    lower.includes("heavy")
  ) {
    toolCalls.push({
      name: "set_style",
      arguments: { styleId: "metal-gallop" },
    });
    return { reply: "Locked in for a heavy metal gallop.", toolCalls };
  }
  if (lower.includes("ballad") || lower.includes("6/8")) {
    toolCalls.push({ name: "set_style", arguments: { styleId: "ballad-68" } });
    return { reply: "Slowing down for the 6/8 ballad.", toolCalls };
  }
  if (lower.includes("straight rock")) {
    toolCalls.push({
      name: "set_style",
      arguments: { styleId: "rock-straight" },
    });
    return { reply: "This is driving a straight 8th rock groove.", toolCalls };
  }

  // 3. Cues
  if (lower.includes("fill") || lower.includes("drum fill")) {
    toolCalls.push({ name: "trigger_cue", arguments: { cue: "fill" } });
    return { reply: "Drum fill coming up at the next bar.", toolCalls };
  }
  if (lower.includes("crash")) {
    toolCalls.push({ name: "trigger_cue", arguments: { cue: "crash" } });
    return { reply: "Crash on the next bar downbeat.", toolCalls };
  }
  if (
    lower.includes("ending") ||
    lower.includes("end it") ||
    lower.includes("bring it home")
  ) {
    toolCalls.push({ name: "trigger_cue", arguments: { cue: "ending" } });
    return { reply: "Leading the ending at the next bar boundary.", toolCalls };
  }

  // 4. Parts
  if (
    lower.includes("drop the bass") ||
    lower.includes("mute bass") ||
    lower.includes("no bass")
  ) {
    toolCalls.push({ name: "set_parts", arguments: { muteBass: true } });
    return { reply: "Dropping the bass out.", toolCalls };
  }
  if (lower.includes("bring in bass") || lower.includes("unmute bass")) {
    toolCalls.push({ name: "set_parts", arguments: { muteBass: false } });
    return { reply: "Bringing the bass back in.", toolCalls };
  }
  if (
    lower.includes("drop drums") ||
    lower.includes("no drums") ||
    lower.includes("mute drums")
  ) {
    toolCalls.push({ name: "set_parts", arguments: { muteDrums: true } });
    return { reply: "This is muting the drums.", toolCalls };
  }
  if (lower.includes("bring in drums") || lower.includes("unmute drums")) {
    toolCalls.push({ name: "set_parts", arguments: { muteDrums: false } });
    return { reply: "This is bringing the drums back in.", toolCalls };
  }

  // 5. Energy Following
  if (
    lower.includes("follow my energy") ||
    lower.includes("follow dynamics") ||
    lower.includes("energy following on")
  ) {
    toolCalls.push({
      name: "toggle_energy_follower",
      arguments: { enabled: true },
    });
    return {
      reply: "I'm listening to your guitar dynamics and matching your energy.",
      toolCalls,
    };
  }

  // 6. Stage count-in, tap, seek, transpose, tuner
  const countIn =
    /^(?:count[- ]?in|opptelling)\s+(0|1|2)\s*(?:bars?|takter?)?[.!]?$/.exec(
      lower,
    );
  if (countIn) {
    toolCalls.push({
      name: "set_count_in",
      arguments: { bars: Number(countIn[1]) },
    });
    return { reply: "Setting the count-in.", toolCalls };
  }
  if (/^(?:tap(?: the)? tempo|slå inn tempoet)[.!]?$/.test(lower)) {
    toolCalls.push({ name: "tap_tempo", arguments: {} });
    return { reply: "This is tapping the tempo.", toolCalls };
  }
  const seekBar =
    /^(?:(?:go|jump|seek) to|gå til)\s+(?:bar|takt)\s+(\d{1,3})[.!]?$/.exec(
      lower,
    );
  if (seekBar) {
    toolCalls.push({
      name: "seek_bar",
      arguments: { bar: Number(seekBar[1]) },
    });
    return { reply: `Jumping to bar ${seekBar[1]}.`, toolCalls };
  }
  const chartPitch =
    /^(?:transpose|transponer)(?:\s+(up|down|opp|ned))?\s+([+-]?\d{1,2})\s*(?:semitones?|halvtoner?)?[.!]?$/.exec(
      lower,
    );
  if (chartPitch) {
    const n = Number(chartPitch[2]);
    const dir = chartPitch[1];
    const semitones =
      dir === "down" || dir === "ned" ? -Math.abs(n) : n === 0 ? 0 : n;
    if (semitones !== 0) {
      toolCalls.push({
        name: "transpose_chart",
        arguments: { semitones },
      });
      return { reply: "Transposing the chart.", toolCalls };
    }
  }
  if (/^(?:tuner on|stemmeapparat på)[.!]?$/.test(lower)) {
    toolCalls.push({ name: "toggle_tuner", arguments: { enabled: true } });
    return { reply: "The tuner is on.", toolCalls };
  }
  if (/^(?:tuner off|stemmeapparat av)[.!]?$/.test(lower)) {
    toolCalls.push({ name: "toggle_tuner", arguments: { enabled: false } });
    return { reply: "The tuner is off.", toolCalls };
  }

  // 7. Tempo
  const bpmMatch =
    lower.match(/(\d{2,3})\s*bpm/) ||
    lower.match(/tempo\s*(?:to|at)?\s*(\d{2,3})/);
  if (bpmMatch) {
    const bpm = Number.parseInt(bpmMatch[1], 10);
    toolCalls.push({ name: "set_tempo", arguments: { bpm } });
    return { reply: `Setting tempo to ${bpm} BPM.`, toolCalls };
  }
  if (
    lower.includes("faster") ||
    lower.includes("pick it up") ||
    lower.includes("speed up")
  ) {
    toolCalls.push({ name: "set_tempo", arguments: { delta: 5 } });
    return { reply: "Pushing the tempo up 5 BPM.", toolCalls };
  }
  if (
    lower.includes("slower") ||
    lower.includes("slow down") ||
    lower.includes("drag it")
  ) {
    toolCalls.push({ name: "set_tempo", arguments: { delta: -5 } });
    return { reply: "Pulling back the tempo by 5 BPM.", toolCalls };
  }

  // 8. General Playback / Transport
  if (lower.includes("pause") || lower.includes("hold on")) {
    toolCalls.push({
      name: "transport_control",
      arguments: { action: "pause" },
    });
    return { reply: "Pausing. Whenever you're ready.", toolCalls };
  }
  if (lower.includes("stop") || lower.includes("cut it") || lower === "kill") {
    toolCalls.push({
      name: "transport_control",
      arguments: { action: "stop" },
    });
    return { reply: "This playback is stopping.", toolCalls };
  }
  if (
    /\bplay\b/.test(lower) ||
    lower.includes("start") ||
    lower.includes("let's jam") ||
    lower === "go"
  ) {
    toolCalls.push({
      name: "transport_control",
      arguments: { action: "play" },
    });
    return { reply: "This is rolling.", toolCalls };
  }

  return { reply, toolCalls };
}
