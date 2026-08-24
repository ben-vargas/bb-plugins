# Repository instructions

- Keep every BB plugin in its own `plugins/<plugin-id>/` directory.
- Add each plugin to `.bb/plugins.json`; do not duplicate plugin manifest data
  in that collection index.
- Run `npm run ci` at the repository root before proposing a release.
- Use plugin-specific release tags: `<plugin-id>/vX.Y.Z`.
- Treat commits, Git pushes, release tags, npm publications, and marketplace
  pull requests as separate publication actions.
