# bb plugins

Open-source plugins for [bb](https://github.com/get-bb/bb), the agent IDE.

## Plugins

| Plugin | Description |
| --- | --- |
| [Project Activity Sort](./plugins/project-activity-sort) | Orders sidebar project sections by the most recently updated thread while retaining bb's original sidebar UI. |
| [xAI Voice](./plugins/xai-voice) | Voice transcription (speech-to-text) served by xAI's Grok STT, using an xAI API key or your Grok Build CLI sign-in. Requires bb >= 0.40. |

## Install from GitHub

Install a plugin from the repository's main branch:

```sh
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@main \
  --plugin project-activity-sort
```

Releases use plugin-specific tags such as `xai-voice/v0.1.0`. To track
compatible releases of a plugin:

```sh
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@semver:^0.1.0 \
  --plugin xai-voice \
  --tag-prefix xai-voice/
```

Plugins without a release tag yet install from `main` as shown above.

Check for and apply compatible updates with:

```sh
bb plugin outdated
bb plugin update project-activity-sort
```

## Develop locally

Install the collection dependencies, register one plugin from this checkout,
and start bb's live rebuild/reload loop:

```sh
npm install
bb plugin install path:. --plugin project-activity-sort
bb plugin dev plugins/project-activity-sort
```

Run all repository checks with:

```sh
npm run ci
```

## Repository layout

Each directory under `plugins/` is a complete bb plugin package. The
`.bb/plugins.json` collection manifest indexes those packages so bb can
install one plugin at a time.

## License

[MIT](./LICENSE)
