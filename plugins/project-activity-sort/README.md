# Project Activity Sort for bb

A bb sidebar plugin that changes one thing: project sections are ordered by
the most recent thread update in each project.

If project `def` contains the newest thread, `def` appears first. When a thread
in `xyz` receives a newer `updatedAt` value, `xyz` moves above it.

## Baseline-preserving behavior

The plugin renders bb's original sidebar list instead of drawing its own
project or thread rows. As a result, unread indicators, activity spinners, row
menus, spacing, collapse behavior, keyboard navigation, split interactions,
search, and other left-nav behavior remain owned by bb and match the baseline
system.

The only plugin behavior is:

- Rank each project by `max(thread.updatedAt)` across its visible,
  non-archived threads.
- Reorder bb's existing project-section entries to match that rank.
- Preserve all non-project sidebar sections in their existing positions.
- Keep bb's existing project order when update times tie.
- Leave bb's implicit Personal project in the baseline Threads section.

A nested child thread contributes activity to the project section where bb
displays its root thread tree.

## Compatibility note

The plugin SDK provides bb's original list but does not currently expose a
project-section comparator. This plugin therefore synchronizes bb's existing
per-client section-order preference, `bb.sidebar.sectionOrder`, while delegating
all rendering and interaction to the original list. It targets bb `>=0.39` and
plugin SDK `>=0.4.8`; a future bb change to that preference may require a small
compatibility update.

## Install from GitHub

```sh
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@main \
  --plugin project-activity-sort
```

The plugin registers an exclusive sidebar-list provider named **Projects by
recent activity**. If bb is pinned to another provider, select it under
**Settings → Appearance → Sidebar**.

## Develop and verify

From the monorepo root:

```sh
npm install
npm run ci
bb plugin install path:. --plugin project-activity-sort
bb plugin dev plugins/project-activity-sort
```
