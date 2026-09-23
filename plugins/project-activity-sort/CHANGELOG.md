# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-23

### Changed

- Rebuilt for bb 0.43, where the sidebar list became the bundled
  `thread-list` plugin. The plugin now runs server-side only and keeps the
  Thread list plugin's server-synced `sectionOrder` preference in activity
  order, using its `listPreferences` and `setPreference` RPC methods.
- Re-syncs on thread lifecycle events, on a five-minute sweep, and on start;
  it writes only when the order changes.
- Requires bb `>=0.43` and plugin SDK `>=0.5.9`.

### Removed

- The `experimental_threadList` sidebar provider. bb 0.43 no longer passes it
  the `experimental_Original` list, so it crashed the sidebar.
- The `localStorage` (`bb.sidebar.sectionOrder`) write path, which bb 0.43
  no longer reads.

## [0.1.0]

- Initial release for bb 0.39–0.42.
