# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-25

### Added

- First release: a thread-header toggle button that renders the chat across
  the full window width instead of bb's default 760px column.
- One injected stylesheet rule removes bb's `max-w-[760px]` cap inside
  `[data-thread-window]` while the toggle is on; the column stays in bb's
  normal flex flow, so it still resizes with the left sidebar and right
  panel. Applies to main thread views, split panes, and embedded ThreadChat
  panels; the New-thread compose page is untouched.
- The preference persists per bb client in localStorage and syncs across
  windows of the same profile.
- The in-memory toggle state is authoritative for the window, so the toggle
  keeps working when localStorage throws (private mode, quota); only
  persistence and cross-window sync are lost.
- Disabling or uninstalling the plugin restores the default width
  immediately; if a future bb release renames the targeted internals, the
  toggle degrades to a harmless no-op.

[Unreleased]: https://github.com/ben-vargas/bb-plugins/compare/full-width/v0.1.0...HEAD
[0.1.0]: https://github.com/ben-vargas/bb-plugins/releases/tag/full-width/v0.1.0
