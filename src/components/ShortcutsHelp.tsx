import { useEffect, useRef, useState } from "react";
import manual from "../../docs/guide/manual.json";
import { type HelpLanguage, readHelpLanguage } from "../lib/help";
import { saveRoomPreference } from "../lib/roomActions";
import { SHORTCUTS } from "../lib/shortcuts";
import { useEngineStore } from "../store/engine";
import { Button } from "./Button";
import "./manual.css";

export function ShortcutsHelp({
  open,
  room,
  topic,
  onClose,
}: {
  open: boolean;
  room: string;
  topic: string | null;
  onClose: () => void;
}) {
  const savedLanguage = useEngineStore((s) => readHelpLanguage(s.settings));
  const [language, setLanguage] = useState<HelpLanguage>(savedLanguage);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    () =>
      manual.chapters.find((c) => c.sections.some((s) => s.id === topic))?.id ??
      manual.chapters.find((c) => c.room === room)?.id ??
      "start",
  );
  const search = useRef<HTMLInputElement>(null);
  // Settings load after the first render; adopt the saved choice when they arrive.
  useEffect(() => setLanguage(savedLanguage), [savedLanguage]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const target = topic
      ? document.getElementById(`help-${topic}`)
      : search.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
    return () => {
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (document.activeElement === document.body ||
          document.activeElement?.closest("#studio-help"))
      )
        previous.focus();
    };
  }, [open, topic]);
  if (!open) return null;
  const nb = language === "nb";
  const chooseLanguage = (next: HelpLanguage) => {
    setLanguage(next);
    // The choice holds no secrets; it lives with the other app settings.
    void saveRoomPreference("helpLanguage", next).catch((e) =>
      useEngineStore.getState().notify("error", `Help language: ${String(e)}`),
    );
  };
  const matches = manual.chapters.filter((c) =>
    [
      c.title[language],
      ...c.sections.flatMap((s) => [s.title[language], s.text[language]]),
    ]
      .join(" ")
      .toLocaleLowerCase(language)
      .includes(query.trim().toLocaleLowerCase(language)),
  );
  const chapter = matches.find((c) => c.id === selected) ?? matches[0];
  return (
    <aside
      id="studio-help"
      className="studio-manual"
      lang={language}
      aria-label={nb ? "Hjelp og veiledninger" : "Help & guides"}
    >
      <header className="manual-heading">
        <div>
          <h1>{nb ? "Hjelp og veiledninger" : "Help & guides"}</h1>
          <p>
            {nb
              ? "Fra første idé til ferdig låt. Filene dine lagres lokalt i skrivebordsappen."
              : "From first idea to finished song. Your desktop files stay local."}
          </p>
        </div>
        <label>
          {nb ? "Språk" : "Language"}
          <select
            value={language}
            onChange={(e) => chooseLanguage(e.target.value as HelpLanguage)}
          >
            <option value="en">English</option>
            <option value="nb">Norsk bokmål</option>
          </select>
        </label>
        <Button variant="secondary" onClick={onClose}>
          {nb ? "Lukk hjelp" : "Close help"}
        </Button>
      </header>
      <div className="manual-layout">
        <aside>
          <label htmlFor="manual-search">
            {nb ? "Søk i håndboken" : "Search the manual"}
          </label>
          <input
            ref={search}
            id="manual-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label htmlFor="manual-chapter">{nb ? "Kapittel" : "Chapter"}</label>
          <select
            id="manual-chapter"
            value={chapter?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!chapter && (
              <option value="">{nb ? "Ingen treff" : "No matches"}</option>
            )}
            {matches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title[language]}
              </option>
            ))}
          </select>
        </aside>
        <article>
          <p className="sr-only" aria-live="polite">
            {chapter
              ? `${nb ? "Kapittel" : "Chapter"}: ${chapter.title[language]}`
              : ""}
          </p>
          {chapter ? (
            <>
              <h2>{chapter.title[language]}</h2>
              <nav
                aria-label={nb ? "Emner i kapitlet" : "Topics in this chapter"}
              >
                {chapter.sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#help-${s.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      const target = document.getElementById(`help-${s.id}`);
                      target?.focus({ preventScroll: true });
                      target?.scrollIntoView({ block: "nearest" });
                    }}
                  >
                    {s.title[language]}
                  </a>
                ))}
              </nav>
              {chapter.sections.map((s) => (
                <section key={s.id}>
                  <h3 id={`help-${s.id}`} tabIndex={-1}>
                    {s.title[language]}
                  </h3>
                  {s.text[language].split("\n\n").map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </section>
              ))}
            </>
          ) : (
            <p>
              {nb
                ? "Ingen treff. Prøv et annet søkeord."
                : "No matching chapters. Try a different search."}
            </p>
          )}
          {chapter?.id === "start" && (
            <section>
              <h3>{nb ? "Hurtigtaster" : "Keyboard shortcuts"}</h3>
              <p>
                {nb
                  ? "Hurtigtastene er av når fokus er i hjelpen eller du skriver i et felt. I skjemaeditoren spiller Ctrl/Cmd+Enter skjemaet, og Ctrl/Cmd+S lagrer det."
                  : "Shortcuts are off when focus is in help or you are typing in a field. In the chart editor, Ctrl/Cmd+Enter plays the chart and Ctrl/Cmd+S saves it."}
              </p>
              <dl className="manual-shortcuts">
                {SHORTCUTS.map((s) => (
                  <div key={s.keys}>
                    <dt>
                      <kbd>{s.keys}</kbd>
                    </dt>
                    <dd>
                      {nb
                        ? manual.shortcutsNb[
                            s.keys as keyof typeof manual.shortcutsNb
                          ]
                        : s.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </article>
      </div>
    </aside>
  );
}
