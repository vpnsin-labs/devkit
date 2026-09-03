# Contributing

Thanks for contributing! This repository uses shared tooling from
[`devkit`](https://github.com/vpnsin-labs/devkit) — a pinned .NET SDK,
repo-wide analyzers, `dotnet format`, Conventional Commit hooks and CI/release
pipelines.

## Getting started

- **.NET SDK** (version pinned in `global.json`)
- `dotnet tool restore` (local tools: versionize)
- `git config core.hooksPath .githooks` (enables the `dotnet format` + commit-msg hooks)
- `dotnet restore`

## Development workflow

1. Branch off `main` (or `dev`):
   `git checkout -b feat/short-description`
2. Make your changes. On commit, the pre-commit hook runs `dotnet format` on the
   staged C# files and the commit-msg hook validates the message.
3. Before pushing, verify locally:

   ```bash
   dotnet build                          # warnings are errors; style rules enforced
   dotnet format --verify-no-changes
   dotnet test
   ```

## Commit messages — Conventional Commits (required)

The `commit-msg` hook enforces them, and {{RELEASE_TOOL}} uses them to compute the
version bump and changelog.

| Type                                                                 | Effect        |
| -------------------------------------------------------------------- | ------------- |
| `feat:`                                                              | minor release |
| `fix:`                                                               | patch release |
| `docs:` `chore:` `refactor:` `test:` `ci:` `build:` `perf:` `style:` | no release    |
| `feat!:` / `BREAKING CHANGE:` footer                                 | major release |

Example: `feat(api): add password reset flow`

## Pull requests

- Keep PRs focused and fill in the PR template.
- Make sure CI is green.
- {{REVIEWERS}}

## Releases

{{RELEASE_FLOW}}
