# devkit

[![npm version](https://img.shields.io/npm/v/@vpnsin/devkit.svg)](https://www.npmjs.com/package/@vpnsin/devkit)
[![npm downloads](https://img.shields.io/npm/dm/@vpnsin/devkit.svg)](https://www.npmjs.com/package/@vpnsin/devkit)
[![license: MIT](https://img.shields.io/npm/l/@vpnsin/devkit.svg)](https://www.npmjs.com/package/@vpnsin/devkit)
[![node](https://img.shields.io/node/v/@vpnsin/devkit.svg)](https://www.npmjs.com/package/@vpnsin/devkit)

Shared development tooling for Node.js & Next.js repos — one source of truth for
**ESLint, Prettier, commitlint, markdownlint, lint-staged, Husky hooks, TypeScript,
VS Code settings, GitHub Actions (CI + CodeQL + dependency review) and
release-please**. It can also **scaffold a runnable Express backend or Next.js
frontend** so a new repo goes from empty to lint-clean-and-running in one command.

Adopt it in any repo with a single command instead of copy-pasting config.

## Documentation

- [Workflows guide](docs/workflows.md) — CI, release, security scanning, Lighthouse, SonarCloud, Dependabot
- [Templates guide](docs/templates.md) — every scaffolded file explained with customisation examples

## Contents

- [Quick start](#quick-start)
- [Spin up a new app](#spin-up-a-new-app)
- [CLI options](#cli-options)
- [Public vs private repos](#public-vs-private-repos)
- [Manual usage (without the CLI)](#manual-usage-without-the-cli)
- [What's inside](#whats-inside)
- [What gets scaffolded](#what-gets-scaffolded)
- [Recommended VS Code extensions](#recommended-vs-code-extensions)
- [Not included (and why)](#not-included-and-why)
- [Conventions this enforces](#conventions-this-enforces)
- [Publishing (maintainers)](#publishing-maintainers)

## Quick start

```bash
# in the target repo (must contain a package.json)
npm i -D @vpnsin/devkit
npx devkit init
```

`init` will:

- detect Next.js vs plain Node and pick the right ESLint + TypeScript preset;
- write thin **config shims** that re-export this package (`eslint.config.ts`,
  `commitlint.config.ts`, `.lintstagedrc.mjs`, `tsconfig.json`, and the
  `prettier` key in `package.json`) so config stays in sync via `npm update`;
- copy the **templates** that can't be referenced — Husky hooks, `.vscode/`,
  `.markdownlint-cli2.jsonc`, the `.github/` **workflows** (CI, CodeQL,
  dependency review, Trivy, release-please) and **governance** (PR template,
  `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, issue templates), plus a
  `README.md` skeleton if one is missing;
- create a **`temp/`** scratch workspace (git-ignored) stocked with format
  starter files for every common file type used in MERN development;
- add npm **scripts** (`lint`, `lint:fix`, `lint:md`, `format`, `format:check`,
  `type-check`, `prepare`);
- install the required dev dependencies and set up Husky.

Existing files are left untouched unless you pass `--force`.

## Spin up a new app

Bootstrap a fresh repo with a working app **plus** all the tooling above:

```bash
mkdir my-api && cd my-api && npm init -y
npx devkit init --backend     # Express + TypeScript API
```

```bash
mkdir my-web && cd my-web && npm init -y
npx devkit init --frontend    # Next.js (App Router) + TypeScript
```

Then:

```bash
cp .env.example .env   # backend/frontend ship an example env file
npm run dev            # tsx watch (backend) / next dev (frontend)
```

**`--backend`** scaffolds an Express + TypeScript skeleton and selects the Node
preset:

- `src/server.ts` (entry + graceful shutdown), `src/app.ts` (app factory with
  `helmet` + `cors` + JSON body parsing), `src/routes/health.ts`, `src/env.ts`;
- a multi-stage `Dockerfile` (non-root, `--omit=dev` runtime) and `.dockerignore`;
- `.env.example`, and `dev` / `build` / `start` scripts;
- runtime deps `express`, `cors`, `helmet`, `dotenv`.

**`--frontend`** scaffolds a Next.js App Router skeleton and selects the Next
preset:

- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `next.config.mjs`;
- `.env.example`, and `dev` / `build` / `start` scripts;
- runtime deps `next`, `react`, `react-dom`.

The app starters are flat (single-app) layouts; run them in separate
directories for a backend **and** a frontend, or wire up a monorepo yourself.

## CLI options

```bash
npx devkit init --next        # force the Next.js preset
npx devkit init --node        # force the base (Node) preset
npx devkit init --backend     # scaffold an Express + TypeScript backend
npx devkit init --frontend    # scaffold a Next.js (App Router) frontend
npx devkit init --private     # private repo: skip GHAS workflows (auto-detected via gh)
npx devkit init --public      # public repo: include GHAS workflows
npx devkit init --jest        # scaffold Jest (ts-jest)
npx devkit init --vitest      # scaffold Vitest (alternative to Jest)
npx devkit init --scorecard   # also add the OSSF Scorecard workflow (public repos)
npx devkit init --lighthouse  # also add a Lighthouse CI workflow (web apps)
npx devkit init --skills      # also add Claude Code skills (design-craft for UI/UX)
npx devkit init --publish     # auto-publish to npm when the release PR merges (needs NPM_TOKEN)
npx devkit init --sonar       # also add SonarCloud analysis (needs SONAR_TOKEN secret)
npx devkit init --force       # overwrite existing config/template files
npx devkit init --no-install  # scaffold only, install deps yourself
```

## Public vs private repos

GitHub Advanced Security — **CodeQL, Trivy, Dependency Review, Scorecard** — is
free on **public** repos but needs a paid licence on **private** ones. `init`
auto-detects visibility with the `gh` CLI (override with `--private` / `--public`):

- **Public** → the full GHAS workflow set is scaffolded.
- **Private** → those GHAS workflows are skipped; you still get **Dependabot**
  (alerts + grouped update PRs) and a non-blocking **`npm audit`** step in CI for
  free dependency security. (Enable _Dependabot alerts_ in repo settings.)

`--sonar` adds a CI-based SonarCloud scan and a `sonar-project.properties`.
Set a `SONAR_TOKEN` secret, fill in your org/project keys, and turn **off**
Automatic Analysis in SonarCloud (CI and Automatic Analysis can't both run).
SonarCloud is also free only for public projects.

With `--publish`, merging the release-please PR auto-publishes to npm: the publish
step is integrated into the release-please workflow (a release created with
`GITHUB_TOKEN` can't trigger a separate `on: release` workflow, so it must live
there). You also get a manual `Publish (manual)` workflow (`workflow_dispatch`) to
re-publish if an auto-publish fails. Add an `NPM_TOKEN` repository secret (an npm
automation token) for it to authenticate.

After running, fill the placeholders in `.github/CODEOWNERS` (`@OWNER`) and the
security contact in `.github/SECURITY.md`.

## Manual usage (without the CLI)

Each config is also importable directly:

```ts
// eslint.config.ts  (needs the `jiti` devDependency to load TS config)
export { default } from '@vpnsin/devkit/eslint/next'; // or '@vpnsin/devkit/eslint/base'

// extend it:
import base from '@vpnsin/devkit/eslint/base';
export default [...base, { rules: { 'no-console': 'off' } }];
```

```jsonc
// package.json
{ "prettier": "@vpnsin/devkit/prettier" }
```

```ts
// commitlint.config.ts
export { default } from '@vpnsin/devkit/commitlint';

// vitest.config.ts (alternative to Jest)
import { defineConfig } from 'vitest/config';
import base from '@vpnsin/devkit/vitest';
export default defineConfig(base);
```

```js
// .lintstagedrc.mjs  (stays .mjs — .ts breaks the bare `npx lint-staged` hook)
export { default } from '@vpnsin/devkit/lint-staged';

// jest.config.mjs (Node + ts-jest; stays .mjs — ts-node can't re-export the ESM preset)
export { default } from '@vpnsin/devkit/jest';
```

```jsonc
// tsconfig.json — extend a shared base (base / node / next)
{
  "extends": "@vpnsin/devkit/tsconfig/node.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"],
}
```

## What's inside

- **ESLint** — `@vpnsin/devkit/eslint/base` (Node) / `@vpnsin/devkit/eslint/next`
  (base + `eslint-config-next`). Flat config: JS + typescript-eslint + Prettier.
- **Prettier** — `@vpnsin/devkit/prettier` (100 width, single quotes, es5 commas).
- **commitlint** — `@vpnsin/devkit/commitlint` (Conventional Commits).
- **lint-staged** — `@vpnsin/devkit/lint-staged` (ESLint/Prettier/markdownlint on staged files).
- **TypeScript** — `@vpnsin/devkit/tsconfig/{base,node,next}.json` (strict base + Node/Next variants).
- **Jest / Vitest** — `@vpnsin/devkit/jest` (ts-jest) or `@vpnsin/devkit/vitest`; opt-in via `--jest` / `--vitest`.
- **App starters** — `--backend` (Express + TS) / `--frontend` (Next.js App Router + TS).
- **GitHub workflows** — CI, CodeQL, dependency review, Trivy, release-please; opt-in: Scorecard, Lighthouse, npm-publish, SonarCloud.
- **Governance** — `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, PR & issue templates.
- **EditorConfig** — `templates/editorconfig` (LF, UTF-8, 2-space).
- **npm config** — `.npmrc` (`engine-strict`, quieter installs; optional exact pins).
- **Spell check** — `cspell.json` for the recommended Code Spell Checker extension.
- **Node version** — `.nvmrc`; CI reads it via `node-version-file`.
- **Scratch workspace** — `temp/` (git-ignored) with format starter files for JS, TS, JSON, env, log, shell, PowerShell, plain text, Markdown, and HTTP requests.
- **Claude Code skills** — `design-craft` (a UX/visual-design protocol); opt-in via `--skills`.

## What gets scaffolded

| Area                                         | Source template                                            | Purpose                                                        |
| -------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| ESLint / Prettier / commitlint / lint-staged | shims re-exporting the package                             | flat ESLint, Prettier, Conventional Commits, staged-file lint  |
| TypeScript                                   | `tsconfig.json` extending `@vpnsin/devkit/tsconfig/*`      | strict base + Node/Next variant                                |
| Backend app                                  | `templates/app/backend/*`                                  | Express + TS skeleton, Dockerfile (opt-in, `--backend`)        |
| Frontend app                                 | `templates/app/frontend/*`                                 | Next.js App Router + TS skeleton (opt-in, `--frontend`)        |
| markdownlint                                 | `templates/markdownlint-cli2.jsonc`                        | tuned to coexist with Prettier                                 |
| Spell check                                  | `templates/cspell.json`                                    | project words + ignores for the Code Spell Checker extension   |
| npm config                                   | `templates/npmrc`                                          | `engine-strict`, quieter installs, optional exact pins         |
| Husky hooks                                  | `templates/husky/*`                                        | pre-commit → lint-staged, commit-msg → commitlint              |
| CI                                           | `templates/github/workflows/ci.yml`                        | type-check, lint, lint:md, format, build (each `--if-present`) |
| GHAS                                         | `codeql.yml`, `dependency-review.yml`, `trivy.yml`         | code scanning + vulnerable-dependency gate (public repos)      |
| Scorecard                                    | `templates/github/workflows/scorecard.yml`                 | OSSF supply-chain posture (opt-in, `--scorecard`)              |
| Releases                                     | `release-please.yml` + config                              | semantic version bumps, tags & changelog                       |
| Governance                                   | `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, templates  | project docs & review routing                                  |
| Editor                                       | `templates/vscode/*`                                       | format + ESLint/markdownlint fix on save                       |
| Scratch workspace                            | `templates/temp/*`                                         | git-ignored `temp/` with format starters for 10 file types     |

## Recommended VS Code extensions

`init` writes a `.vscode/extensions.json` so VS Code prompts the team to install a
shared set of extensions. They're _recommendations_, not requirements — nothing
breaks if you skip one. Grouped by what they do:

**Formatting, linting & spell-check** — the toolchain devkit wires up:

- `esbenp.prettier-vscode` — format on save with Prettier.
- `dbaeumer.vscode-eslint` — inline ESLint + fix-on-save.
- `DavidAnson.vscode-markdownlint` — lint/fix Markdown (matches `lint:md`).
- `streetsidesoftware.code-spell-checker` — spell-check code & docs (reads `cspell.json`).
- `EditorConfig.EditorConfig` — apply `.editorconfig` (LF, 2-space, final newline).

**Diagnostics & DX**:

- `usernamehw.errorlens` — show errors/warnings inline on the line.
- `yoavbls.pretty-ts-errors` — make TypeScript errors readable.
- `wix.vscode-import-cost` — show the bundle size of each import.

**JavaScript / TypeScript / React authoring**:

- `dsznajder.es7-react-js-snippets` — React/Hooks snippets.
- `formulahendry.auto-rename-tag` — rename paired JSX/HTML tags together.
- `christian-kohler.npm-intellisense` — autocomplete `import` paths for npm packages.
- `christian-kohler.path-intellisense` — autocomplete local file paths.
- `wmaurer.change-case` — convert identifiers between camel/snake/kebab/etc.

**Testing** (pairs with `devkit init --jest`):

- `orta.vscode-jest` — run the Jest suite with inline pass/fail decorations.
- `firsttris.vscode-jest-runner` — run/debug a single test or `describe` block.
- `andys8.jest-snippets` — snippets for `describe`/`it`/`expect`.

**Git & GitHub** (devkit ships PR templates, governance & GH workflows):

- `eamodio.gitlens` — blame, history & authorship inline.
- `donjayamanne.githistory` — browse file/line history and diffs.
- `ziyasal.vscode-open-in-github` — jump from a line to its page on GitHub.
- `github.vscode-pull-request-github` — review & manage PRs/issues in-editor.

**Code quality** (pairs with `--sonar`):

- `sonarsource.sonarlint-vscode` — SonarLint findings as you type (mirrors SonarCloud).

**File-type support shipped by this scaffold**:

- `mikestead.dotenv` — syntax highlighting for `.env` / `.env.example`.
- `redhat.vscode-yaml` — schema-aware YAML (workflows, Dependabot, etc.).
- `github.vscode-github-actions` — validate & run GitHub Actions workflows.
- `humao.rest-client` — send HTTP requests from `temp/format.http` directly in VS Code.

**Markdown & docs**:

- `yzhang.markdown-all-in-one` — TOC, list editing, shortcuts, preview.
- `bierner.markdown-mermaid` — render Mermaid diagrams in Markdown preview.
- `tom-latham.markdown-pdf-plus` — export Markdown to PDF/HTML.

**Productivity & navigation**:

- `gruntfuggly.todo-tree` — collect `TODO`/`FIXME` markers into a tree.
- `hediet.vscode-drawio` — edit `.drawio` diagrams inside VS Code.
- `l13rary.l13-diff` — compare two folders side by side.
- `bokuweb.vscode-ripgrep` — fast ripgrep-powered search.
- `ritwickdey.liveserver` — serve static files with live reload.

> **Intentionally not recommended.** Color/icon **themes** (keep those in your
> personal user settings — recommending them nags the whole team) and
> **cloud/IaC tooling** (Azure CLI, Azure Resource Groups, Azure Pipelines,
> Terraform, PowerShell). devkit is a generic Node.js/Next.js kit using GitHub
> Actions, so those are off-domain — add them per-project if your repo needs them.

## Not included (and why)

- **Babel / Webpack** — frameworks own this layer. Next.js uses SWC + webpack/
  Turbopack (configure via `next.config.js`); Vite/Vitest use esbuild + Rollup;
  plain TS libraries build with `tsc`/tsup. A shared Babel or Webpack config
  would conflict or go unused. (A `tsup`/Rollup preset can be added if a
  non-framework browser library ever needs bundling.)

## Conventions this enforces

- **Conventional Commits** (`feat:`, `fix:`, `chore:` …) — required by the
  `commit-msg` hook and read by release-please to bump the version.
- **Formatting is owned by Prettier**; ESLint surfaces deviations as warnings.
- **CI** runs `type-check`, `lint`, `lint:md`, `format:check`, `build` (each
  `--if-present`, so it adapts to repos without a build step).

## Publishing (maintainers)

```bash
npm version <patch|minor|major>
npm publish        # publishConfig.access is "public"
```

Consumers pick up changes with `npm update @vpnsin/devkit` (shims) — template files
are re-synced by re-running `npx devkit init --force`.
