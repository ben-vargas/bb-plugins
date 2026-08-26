# bb-plugin-xai-voice

Voice transcription (speech-to-text) for bb, served by xAI's Grok STT
(`https://api.x.ai/v1/stt`). Registers the `xai-voice` AI service so bb's
prompt-box dictation can run on xAI instead of OpenAI or Codex.

## Requirements

- bb newer than 0.39.0 (the plugin AI-services API — `experimental_aiServices`
  with a `voice` kind — landed after that release).
- Credentials on the host that runs transcription, either of:
  - **xAI API key** — `XAI_API_KEY` in the host daemon's environment.
  - **Grok sign-in (OAuth)** — a Grok Build CLI session in its auth store
    (`GROK_AUTH_PATH`, else `$GROK_HOME/auth.json`, else
    `~/.grok/auth.json`; run `grok` once to sign in). The plugin treats
    that store as strictly read-only: when the ~6h access token has
    expired it runs `grok sessions list -n 1` — whose first act is the
    CLI's own unconditional non-interactive refresh
    (`try_ensure_fresh_auth`: cross-process lock, refresh-token rotation,
    atomic persist) — then re-reads the store. The spawned CLI is never
    killed; a transcription that runs out of time while a refresh is in
    flight returns bb's retryable `timeout` code and the next attempt
    reads the refreshed session. The `grok` binary must be on the host
    daemon's PATH for OAuth.

When both are present the API key wins.

## Setup

```sh
# from GitHub, tracking compatible releases:
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@semver:^0.1.0 \
  --plugin xai-voice \
  --tag-prefix xai-voice/

# or from a local checkout of this repository:
bb plugin install path:. --plugin xai-voice

npx bb-app config set BB_TRANSCRIPTION xai-voice/grok-stt
```

xAI exposes no STT model choice — the `<model>` segment after `xai-voice/` is
required by bb's `<service>/<model>` format but otherwise unused.

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
`engines.bbPluginSdk` (>= 0.4.16, i.e. bb newer than 0.39.0) so
`dist/*.meta.json` records a matching `builtWith`; artifacts built by an
older bb carry stale metadata and must not be packed or tagged.
