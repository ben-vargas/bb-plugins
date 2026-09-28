# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-28

### Changed

- **Breaking:** ported to bb 0.44's AI-services API (plugin SDK >= 0.5.23).
  The server entry now registers a plain `transcribe` function and a
  `status` check; transcription still runs in the host entry on the primary
  machine, behind a plugin-private RPC contract. bb 0.44 rejected 0.1.0 with
  `AI service "xai-voice" must declare complete, transcribe, or both`.
- Select the service with `bb settings ai-services set voice xai-voice` or
  in Settings → AI services; `BB_TRANSCRIPTION` no longer exists in bb.
- The service reports not ready when the primary machine has neither
  `XAI_API_KEY` nor a Grok session, so bb hides the microphone.
- bb cancelling a dictation now aborts the in-flight xAI request.
- Scoped the npm package name to `@benvargas/bb-plugin-xai-voice` and added
  `CHANGELOG.md` to the publish files whitelist; the plugin id (`xai-voice`)
  and git-tag installs are unchanged.

## [0.1.0] - 2026-08-25

### Added

- First release: registers the `xai-voice` AI service so
  `BB_TRANSCRIPTION=xai-voice/grok-stt` routes bb's voice dictation to
  xAI's Grok speech-to-text (`https://api.x.ai/v1/stt`).
- Two credential sources: `XAI_API_KEY` in the host daemon environment
  (takes precedence), or the Grok Build CLI's OAuth session resolved like
  grok-build (`GROK_AUTH_PATH`, else `$GROK_HOME/auth.json`, else
  `~/.grok/auth.json`).
- Credential-safe OAuth refresh: the auth store is strictly read-only. A
  locally expired session delegates to `grok sessions list -n 1` (the
  CLI's own non-interactive refresh with its cross-process lock and
  refresh-token rotation); the spawned CLI is never killed, concurrent
  transcriptions share one spawn, and a refresh that outlives the
  request budget returns bb's retryable `timeout` code.
- Bounded 401 recovery: one retry with the best other unexpired store
  entry, never a CLI spawn; 403 never retries.
- `XAI_STT_URL` endpoint override for proxies.

[Unreleased]: https://github.com/ben-vargas/bb-plugins/compare/xai-voice/v0.2.0...HEAD
[0.2.0]: https://github.com/ben-vargas/bb-plugins/compare/xai-voice/v0.1.0...xai-voice/v0.2.0
[0.1.0]: https://github.com/ben-vargas/bb-plugins/releases/tag/xai-voice/v0.1.0
