# Full Width for bb

Adds a toggle button to the thread header that lets the chat render across
the full window width instead of bb's default 760px column.

## How it works

bb centers every thread's timeline and composer in a `max-w-[760px]` column
inside `[data-thread-window]`. When the toggle is on, the plugin's content
script injects one stylesheet rule that removes that cap:

```css
html[data-bb-plugin-full-width] [data-thread-window] .max-w-\[760px\] {
  max-width: none;
}
```

The column stays in bb's normal flex flow, so it still resizes live when you
collapse the left sidebar or open the right panel/tools — only the artificial
cap goes away. It applies to the main thread view, split panes, and embedded
ThreadChat panels alike; the New thread compose page is left untouched.

## Install

```sh
# from GitHub, tracking compatible releases:
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@semver:^0.1.0 \
  --plugin full-width \
  --tag-prefix full-width/

# or from a local checkout of this repository:
bb plugin install path:. --plugin full-width

# or from npm:
bb plugin install npm:@benvargas/bb-plugin-full-width@^0.1.0
```

## Toggle and persistence

- The toggle renders in the thread header's action row (bb's "…" context
  menu is not extensible by plugins).
- The preference persists per bb client in localStorage and syncs across
  windows of the same profile. If storage is unavailable (private mode,
  quota), the toggle still works for the current window via in-memory state;
  only persistence and cross-window sync are lost.
- Disabling or uninstalling the plugin restores the default width
  immediately.

## Compatibility note

The stylesheet targets bb-internal markup (`data-thread-window` and the
`max-w-[760px]` utility, current as of bb 0.40). If a future bb release
renames either, the toggle degrades to a harmless no-op until this plugin is
updated.
