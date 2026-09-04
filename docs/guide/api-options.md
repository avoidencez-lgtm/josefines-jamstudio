# More brains, one songwriting workflow

## Connect once

In the desktop app open **Settings → AI providers & Song Lab**. Choose Gemini,
OpenAI, Anthropic Claude or OpenRouter. Expand API keys, paste that provider's key
and save it. Saved keys live in the OS keychain and are never returned to the UI.
API access is billed separately from consumer chat subscriptions.

Keep the suggested model or type a model ID, then **Save AI settings**. This
selection is shared by Jo and Song Lab. Custom models must support the selected
provider's text endpoint and function calling for Jo. The explicit **Test model
(API request)** button sends a small request and can incur a charge. It never
runs automatically. No live paid API calls were made during this implementation.

| Connection | Suggested model | Implemented use |
| --- | --- | --- |
| Google Gemini | `gemini-2.5-flash` | Jo actions and Song Lab ideas |
| OpenAI Responses | `gpt-4.1-mini` | Jo actions and Song Lab ideas |
| Anthropic Messages | `claude-sonnet-4-6` | Jo actions and Song Lab ideas |
| OpenRouter Chat Completions | `openai/gpt-4.1-mini` | Choose a compatible model through one gateway |

These are editable defaults, not a ranking or a claim to be the newest models.
OpenRouter routes through its service to model providers. The app sends each
request to the selected connection only; it never retries against another paid
provider. Jo can still interpret supported commands locally after reporting a
cloud failure. Song Lab reports the failure and leaves the song alone.

Under **Response limits and cost estimate**, set 256–4096 output tokens. Optional
input/output prices are USD per million tokens, with links to current pricing.
Unknown prices stay unknown. Changing the model clears its prices. Estimates use
approximate input tokens and the output limit; they are not the final bill or a
spending cap. Configure spending limits with the provider. The network usage log
records provider, model, status, time, bytes and the optional estimate, not prompts.
Browser preview demonstrates editing only; keys and cloud requests are disabled.

## Four ways to get unstuck

Open a song in **Write**, select a section and expand **Song Lab**:

- **Alternative chords:** “Keep the melody space and use easy open guitar shapes;
  make the chorus brighter.” Review and edit the proposed chords, then apply.
- **A contrasting bridge:** “Eight bars, quieter first half, build back to the
  chorus.” Apply adds an editable section at the end; move it in the song form.
- **A lyric seed:** “Three concrete images about leaving home, no generic slogans.”
  Review and edit the proposed text, then apply it to the selected section lyric sheet.
- **Arrangement feedback:** “Where can the bass drop out so the last chorus feels
  bigger?” Keep the suggestions, then adjust the existing part controls yourself.

Only the chart, section settings, notes, selected section and rig profile name
are sent. No take audio is uploaded; feedback cannot assess the sound or timing
of a recording. Suggestions remain local to this screen until applied. Applying
keeps the previous song as a named version; save the song to persist both. Play
hears the updated arrangement through the existing local band engine. Restore a
version to compare. Editing the song while a request runs makes its proposal
stale and prevents applying it to the wrong arrangement. Invalid/truncated replies
and invalid chord edits do not alter the song. Chord ideas are limited to 16 bars;
the existing 256-bar song and 20-version limits still apply.

## Audio and music video

The **AI Music** and **Film** screens now connect Lyria, Eleven Music, MiniMax, Runway and local ComfyUI workflows. They share editable storyboards, retained generation jobs and local MP4 rendering. See [the music-video guide](music-video.md) for model access, setup and verified limits. Music.ai separation/transcription remains researched but unimplemented.

## Contract evidence and acceptance

Official documentation checked 2026-09-04:
[Gemini model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash),
[OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling),
[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini),
[Claude Messages](https://platform.claude.com/docs/en/api/messages/create),
[Claude Sonnet 4.6](https://platform.claude.com/docs/en/models/sonnet-4-6/overview),
[OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling).

`tests/fixtures/providers/brains.json` contains synthetic examples based on these
contracts, not captured live responses. `tests/invariants/providers.test.ts`
checks request shapes, normalized actions, malformed/truncated replies, one proxy
call on failure, version preservation and stale proposal rejection. Rust tests
check the allowlist, auth-header protection, redirect refusal and usage metadata.

Owner acceptance: on the Mac save a key, run Test model, ask Jo for a small tempo
change, then generate/edit/apply each Song Lab mode. Save, restart and verify the
selected model and song versions persist. Check the provider dashboard against
the local usage log. Account/model access and live output quality remain unverified
until this session is performed.

## Stay in the studio with Codex or Claude Code

Open **Studio assistant** from **Assistant** in the top bar of any screen. It stays open while
you move around Jamstudio and retains the current chat until the app closes.
Choose **Codex · installed CLI** or **Claude Code · installed CLI**. The same
selection is used by Jo and Song Lab. This conversation is local to Jamstudio;
it does not import the chat you already have open in either agent's own UI.

Install a current native CLI and sign in once using that CLI's supported login.
In Settings select it, leave Model ID as `default`, and press **Detect installed
agent**. Detection runs `--version` only; it does not spend model usage or prove
login. If detection fails, supply its full executable path. On Windows select the
native `.exe`; on Mac the app also searches common Homebrew and `~/.local/bin`
locations. `default` uses the CLI's built-in default; custom user CLI configuration
is deliberately not loaded. Enter a supported model ID to select another model.
Then save the settings and use **Test agent (uses account)** or send your first
studio request. No recurring switch to the agent's terminal/app is needed.

The selected CLI keeps its own login. A saved ChatGPT login was confirmed here,
and the actual Rust-to-Codex structured-reply check passed using that login.
Claude Code is implemented against its official protocol but was not available
for a live test on this machine. Plans, model access and limits are account-specific.
Saved CLI API-key authentication can still incur API charges. The app does not
convert a chat subscription into a general API key or promise unlimited usage.
The official [Codex authentication guide](https://developers.openai.com/codex/auth)
and [Claude subscription update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
were checked 2026-09-04; Anthropic currently says headless/SDK usage draws from plan
limits while its announced billing change is paused.

## More models without another app update

For Gemini, OpenAI, Claude API or OpenRouter, press **Load provider models** in
Settings. Start typing in **Model ID** to pick a returned ID. Gemini is filtered
to text generation and OpenRouter to tool-capable entries. OpenAI's catalog can
include non-chat models; use the explicit model test to check suitability. The
first Gemini/Claude page contains up to 100 entries; an unlisted ID can always be
typed manually. Catalogs are fetched only when requested, with no generation call.
The endpoint and model must support our text/tool protocol; a listing is not a
claim that every listed model has been tested. A model change clears stale prices.

Sources: [OpenAI models](https://developers.openai.com/api/reference/resources/models/methods/list),
[Claude models](https://platform.claude.com/docs/en/api/models/list),
[Gemini models](https://ai.google.dev/api/models),
[OpenRouter models](https://openrouter.ai/docs/api/api-reference/models/get-models).
The public OpenRouter catalog was fetched successfully during implementation;
authenticated account-specific lists still need owner verification.

## Make useful changes, not just suggestions

The assistant now has six additional tools, shared with Jo and every connection:

- Change the song title/tempo, or transpose the band's chords while guitar stays
  at its recorded pitch: “Move the band down two semitones so I can sing it.”
- Rewrite a section or add up to 16 bars: “Add a quiet eight-bar bridge in Am.”
- Reorder/repeat existing sections: “Verse, chorus, verse, then two choruses.”
- Shape individual parts: “Mute verse drums and lower verse bass intensity; leave
  my locked chorus bass alone.” Locked parts reject AI edits until you unlock them.
- Append lyrics, rehearsal plans or recording checklists to song notes.
- Run the existing local timing/dynamics/intonation analysis on a saved take and
  include its metrics in a follow-up request. These are heuristic measurements,
  not an AI listening assessment. Refresh takes in Write/Sessions if needed.

The panel lists proposed actions with values; expand **Tweak proposed action
values** for an editable JSON version, or ask for a revision in plain language.
**Apply proposed actions** validates an entire group of song edits before changing
anything and keeps one version. Transport/analysis actions are applied one at a
time; request them separately from song edits. Guitar clips keep their absolute
bar positions when the form changes, so check their placement in Write. Save to
persist the result, then Play to audition. Proposals made before an intervening
song edit are refused. Adding a section gives it a new ID; ask again after applying
it before asking the assistant to place that new section in the form.

**Cancel request** terminates a running local CLI request. For API connections it
discards the answer while the bounded network request finishes. Usage already
incurred still counts. No provider fallback is added. The panel sends text/chart,
rig name and cached local analysis summaries, not audio. Jo's dedicated screen executes local band commands directly and reviews proposed song edits before applying them, as does the assistant panel. [Bridge boundaries and acceptance](../adr/0007-installed-studio-agents.md).
