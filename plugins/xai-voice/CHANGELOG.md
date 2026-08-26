# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ben-vargas/bb-plugins/compare/xai-voice/v0.1.0...HEAD
[0.1.0]: https://github.com/ben-vargas/bb-plugins/releases/tag/xai-voice/v0.1.0
