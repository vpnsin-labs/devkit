# Contributing

Thanks for contributing! This repository uses shared tooling from
[`ladevconfig`](https://github.com/vpnsin/ladevconfig) — ESLint, Prettier,
commitlint, markdownlint, Husky, and CI/release workflows.

## Getting started

- **Node.js** >= 18.18 and **npm**
- `npm install` (sets up Git hooks via Husky automatically)

## Development workflow

1. Branch off `main` (or `dev`):
   `git checkout -b feat/short-description`
2. Make your changes. On commit, the pre-commit hook auto-formats and lints
   staged files.
3. Before pushing, verify locally:

   ```bash
   npm run type-check
   npm run lint
   npm run lint:md
   npm run format:check
   npm run build   # if the repo has a build step
   ```

## Commit messages — Conventional Commits (required)

The `commit-msg` hook enforces them, and release-please uses them to compute the
version bump and changelog.

| Type                       | Effect          |
| -------------------------- | --------------- |
| `feat:`                    | minor release   |
| `fix:`                     | patch release   |
| `docs:` `chore:` `refactor:` `test:` `ci:` `build:` `perf:` `style:` | no release      |
| `feat!:` / `BREAKING CHANGE:` footer | major release |

Example: `feat(auth): add password reset flow`

## Pull requests

- Keep PRs focused and fill in the PR template.
- Make sure CI is green.
- A code owner (see `CODEOWNERS`) will review and merge.

## Releases

Merging to `main` opens or updates a **release-please** PR. Merging that PR
publishes the GitHub release, tag, and changelog.
