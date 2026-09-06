import { ipc } from "../../ipc/client";
import { useEngineStore } from "../../store/engine";
import { type MediaAsset, loadReference, useMedia } from "../media";
import type { JoAction } from "./tools";

const normalized = (text: string) => text.trim().normalize("NFC").toLowerCase();

export const loadSong: JoAction = {
  declaration: {
    name: "load_song",
    description:
      "Load an existing local audio song for practice by title, unique title fragment or exact asset ID. Searches the current Songs library; ambiguous matches require a more precise query. Restores saved stems, speed/key and confirmed sections, opens Stage paused. Does not import, generate, upload or start playback. Unavailable during recording or another media operation. Ask again after loading to change its practice settings using fresh reference context.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Song title or exact asset ID, 1–200 characters.",
        },
      },
      required: ["query"],
    },
  },
  run: async (args) => {
    const query = String(args.query).trim();
    if (!query || query.length > 200)
      throw new Error("Choose a song title or ID of 1–200 characters.");
    const engine = useEngineStore.getState();
    if (engine.isPreview)
      throw new Error("Open the desktop app to load songs.");
    if (engine.isRecording || useMedia.getState().busy)
      throw new Error("Finish the recording or media operation first.");
    useMedia.setState({ busy: "Loading reference", message: "" });
    try {
      // Read native files on every call; the Songs room may never have opened.
      const library = await ipc.invoke<{
        assets: MediaAsset[];
        warnings?: string[];
      }>("media_list");
      useMedia.setState({
        assets: library.assets,
        message: library.warnings?.join("\n") ?? "",
      });
      const songs = library.assets.filter((a) => a.kind === "audio");
      const exact = songs.filter((a) => a.id === query);
      const title = normalized(query);
      const named = songs.filter((a) => normalized(a.label) === title);
      const matches = exact.length
        ? exact
        : named.length
          ? named
          : songs.filter((a) => normalized(a.label).includes(title));
      if (!matches.length)
        throw new Error(
          "No matching audio song. Check its title or import it in Songs first.",
        );
      if (matches.length !== 1)
        throw new Error(
          `Several songs match. Use a full title or exact ID: ${matches
            .slice(0, 5)
            .map((a) => `${a.label} [${a.id}]`)
            .join(
              "; ",
            )}${matches.length > 5 ? "; more matches in Songs" : ""}.`,
        );
      const song = matches[0];
      await loadReference(song.id);
      useEngineStore.getState().setScreen("stage");
      return `Loaded ${song.label}. Press Play when ready.`;
    } finally {
      useMedia.setState({ busy: "" });
    }
  },
};
