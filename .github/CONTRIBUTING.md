# Contributing to devkit

Thanks for helping improve the shared dev config!

## Getting started

- **Node.js** >= 18.18 and **npm**
- `npm install`
- `npm test` — syntax-checks the CLI and loads the config presets

## Layout

- `eslint/`, `prettier/`, `commitlint/`, `lint-staged/` — the shareable presets
  (consumed directly by sibling repos).
- `templates/` — files copied into consumers by `bin/cli.js` (Husky hooks,
  `.vscode/`, `.github/` workflows + governance, markdownlint config).
- `bin/cli.js` — the `devkit init` scaffolder.

When you change a **preset**, consumers pick it up via `npm update`. When you
change a **template**, consumers re-sync with `npx devkit init --force`.

## Conventional Commits (required)

Commit messages drive release-please (version bump + changelog):

- `feat:` → minor, `fix:` → patch, `feat!:` / `BREAKING CHANGE:` → major
- `chore:` `docs:` `refactor:` `test:` `ci:` `build:` — no release

## Pull requests

Keep PRs focused, fill the template, and make sure CI is green. Releases are
automated: merging to `main` opens a release-please PR; merging that publishes
the release and tag (and `npm publish` runs from the tagged release).
