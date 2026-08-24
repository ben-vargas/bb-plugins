# bb plugins

Open-source plugins for [bb](https://github.com/get-bb/bb), maintained by
Ben Vargas.

## Plugins

| Plugin | Description |
| --- | --- |
| [Project Activity Sort](./plugins/project-activity-sort) | Orders sidebar project sections by the most recently updated thread while retaining bb's original sidebar UI. |

## Install from GitHub

Install a plugin from the repository's main branch:

```sh
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@main \
  --plugin project-activity-sort
```

No release tag has been published yet, so use the `main` install above for
now. Once released, versions use plugin-specific tags such as
`project-activity-sort/v0.1.0`. To track compatible releases:

```sh
bb plugin install \
  git:https://github.com/ben-vargas/bb-plugins.git@semver:^0.1.0 \
  --plugin project-activity-sort \
  --tag-prefix project-activity-sort/
```

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
