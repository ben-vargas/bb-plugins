# Project Activity Sort for bb

A bb plugin that changes one thing: project sections are ordered by
the most recent thread update in each project.

If project `def` contains the newest thread, `def` appears first. When a thread
in `xyz` receives a newer `updatedAt` value, `xyz` moves above it.

## How it works

The plugin has no UI. bb's bundled **Thread list** plugin keeps drawing the
sidebar, so unread indicators, activity spinners, row menus, collapse
behavior, drag and drop, and keyboard navigation all behave exactly as in
stock bb.

A small server-side process keeps the Thread list plugin's `sectionOrder`
preference in activity order:

- Rank each project by `max(thread.updatedAt)` across its visible,
  non-archived threads.
- Reorder only the `project:<id>` entries in `sectionOrder`; Pinned, Threads,
  and any other entries keep their positions.
- Keep the current order when update times tie.
- Leave bb's Personal project in the Threads section.

A nested child thread contributes activity to its root thread's project.

The plugin re-syncs on thread lifecycle events (debounced), every five
minutes as a fallback, and on start. It writes only when the order actually
changes. The preference syncs through the bb server, so every window and
device updates live.

Ordering applies when the sidebar is organized **By project**
(`bb thread-list prefs set organizationMode project`). Manually dragging a
project works, but the next thread update re-sorts the list.

## Compatibility

Requires bb `>=0.43` (the release where the sidebar became the bundled
`thread-list` plugin) and plugin SDK `>=0.5.9`. The plugin reads and writes
the preference through the Thread list plugin's `listPreferences` and
`setPreference` RPC methods. The same data is available from
`bb thread-list prefs get sectionOrder`.

Version 0.1.0 targeted bb 0.39–0.42. It replaced the sidebar list and wrote
`localStorage`. It does not work on bb 0.43 or later.

## Install from GitHub

```sh
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@main \
  --plugin project-activity-sort
```

If you pinned **Projects by recent activity** as the sidebar provider in an
earlier version, switch **Settings → Appearance → Sidebar** back to
Automatic or Thread list.

## Develop and verify

From the monorepo root:

```sh
npm install
npm run ci
bb plugin install path:. --plugin project-activity-sort
bb plugin dev plugins/project-activity-sort
```
