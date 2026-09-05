import {
  handleJoQuery,
  setInputValue,
  useJoConversation,
} from "../lib/jo/conversation";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";

/** The Stage uses the same conversation and review boundary as Jo AI. */
export function JoStage() {
  const { messages, inputValue, busy, pending } = useJoConversation();
  return (
    <section className="flex flex-col gap-2" aria-label="Jo on Stage">
      <div className="flex flex-wrap items-center gap-3">
        <strong>Jo</strong>
        <Button
          size="sm"
          onClick={() => useEngineStore.getState().setScreen("jo")}
        >
          {pending
            ? "Review Jo's proposed edits"
            : "Conversation & voice setup"}
        </Button>
      </div>
      <div className="max-h-20 overflow-y-auto text-sm" aria-live="polite">
        {messages
          .filter((m) => m.id !== "welcome")
          .slice(-2)
          .map((m) => (
            <p key={m.id}>
              <strong>{m.sender === "user" ? "You" : "Jo"}: </strong>
              {m.text}
            </p>
          ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm">Type a command</summary>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleJoQuery(inputValue);
          }}
        >
          <label className="room-tool-field flex-1">
            Message Jo
            <input
              value={inputValue}
              disabled={busy}
              placeholder="Set tempo to 100"
              onChange={(e) => setInputValue(e.target.value)}
            />
          </label>
          <Button
            className="self-end"
            type="submit"
            disabled={busy || !inputValue.trim()}
          >
            Send
          </Button>
        </form>
      </details>
    </section>
  );
}
