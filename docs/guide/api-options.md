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
  Edit the text and keep the useful lines in song notes.
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

## Next audio options, researched but not connected

1. **Hear an arrangement sketch:** ElevenLabs Music accepts a prompt or structured
   composition plan and returns generated audio. A useful next slice would turn
   an approved song outline into a reference demo for the guitarist to react to.
   This needs a Rust audio download/decode path, explicit generation controls and
   actual timing/quality checks; it must not promise an exact playable MIDI score.
   [Compose API](https://elevenlabs.io/docs/api-reference/music/compose).
2. **Rescue a rough demo:** Music.ai exposes asynchronous workflows for stem
   separation, transcription and beat detection. A useful next slice would let
   him explicitly select one recording, separate it, then bring chosen stems back
   as editable layers. This needs upload consent, job progress, bounded downloads
   and alignment checks. Workflow availability depends on the configured account.
   [Workflow API](https://music.ai/docs/api/reference/).

ElevenLabs currently has credential storage only. Neither option above is enabled
by saving a key, and neither is advertised as a completed audio feature.

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
