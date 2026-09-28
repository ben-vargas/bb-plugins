# bb-plugin-xai-voice

Voice transcription (speech-to-text) for bb, served by xAI's Grok STT
(`https://api.x.ai/v1/stt`). Registers the `xai-voice` AI service so bb's
prompt-box dictation can run on xAI instead of Codex.

## Requirements

- bb 0.44 or newer (plugin SDK >= 0.5.23, where AI services became plain
  `transcribe`/`complete` functions picked per task). bb 0.40–0.43 used an
  older host-contract API; use xai-voice 0.1.x there.
- Credentials on the primary machine (where bb's host daemon runs), either of:
  - **xAI API key** — `XAI_API_KEY` in the host daemon's environment.
  - **Grok sign-in (OAuth)** — a Grok Build CLI session in its auth store
    (`GROK_AUTH_PATH`, else `$GROK_HOME/auth.json`, else
    `~/.grok/auth.json`; run `grok` once to sign in). The plugin treats
    that store as strictly read-only: when the ~6h access token has
    expired it runs `grok sessions list -n 1` — whose first act is the
    CLI's own unconditional non-interactive refresh
    (`try_ensure_fresh_auth`: cross-process lock, refresh-token rotation,
    atomic persist) — then re-reads the store. The spawned CLI is never
    killed; a transcription that runs out of bb's 10-second budget while a
    refresh is in flight fails, and the next dictation reads the refreshed
    session. The `grok` binary must be on the host
    daemon's PATH for OAuth.

When both are present the API key wins.

## Setup

```sh
# from GitHub, tracking compatible releases:
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@semver:^0.2.0 \
  --plugin xai-voice \
  --tag-prefix xai-voice/

# or from a local checkout of this repository:
bb plugin install path:. --plugin xai-voice

bb settings ai-services set voice xai-voice
```

Or pick **xAI (API key or Grok sign-in)** for Voice in Settings → AI services.
The picker shows the service as not ready (and bb hides the microphone) when
the primary machine has neither `XAI_API_KEY` nor a Grok session. A picked
service is used alone: bb does not fall back to another service when it
fails. xAI exposes no STT model choice, and bb's vocabulary hint is not sent.

## Configuration

| Knob | Where | Meaning |
| --- | --- | --- |
| `XAI_API_KEY` | host daemon env | API-key auth; takes precedence over OAuth. |
| `XAI_STT_URL` | host daemon env | Full override of the STT endpoint (default `https://api.x.ai/v1/stt`), for proxies. |

## Notes

- OAuth usage is attributed to your Grok subscription account; API-key usage
  bills the xAI console account.
- bb records dictation as `audio/webm` (Opus) in Chromium and the desktop
  app; xAI STT accepts it (verified live), along with the documented WAV,
  MP3, OGG, MP4/M4A, and friends — no transcoding happens.
- The Grok CLI is spawned only when the picked session is locally
  expired; concurrent expired-token transcriptions share one spawn. On a
  401 with an OAuth bearer the plugin never spawns the CLI — it retries
  once with the best *other* unexpired entry in the store (the
  wrong-scope case) and otherwise reports that you need to run `grok` to
  sign in again. A 403 never retries.
- The plugin never writes the Grok auth store — refresh, locking, and
  refresh-token rotation stay entirely inside the Grok CLI.

## Releasing

Build the published `dist/` artifacts with a bb whose SDK matches
`engines.bbPluginSdk` (>= 0.5.23, i.e. bb 0.44 or newer) so
`dist/*.meta.json` records a matching `builtWith`; artifacts built by an
older bb carry stale metadata and must not be packed or tagged.
