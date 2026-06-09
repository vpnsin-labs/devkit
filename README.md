# ladevconfig

Shared development tooling for our Node.js & Next.js repos — one source of truth
for **ESLint, Prettier, commitlint, markdownlint, lint-staged, Husky hooks, VS Code
settings, GitHub Actions (CI + CodeQL + dependency review) and release-please**.

Adopt it in any sibling repo with a single command instead of copy-pasting config.

## Quick start

```bash
# in the target repo
npm i -D ladevconfig
npx ladevconfig init
```

`init` will:

- detect Next.js vs plain Node and pick the right ESLint preset;
- write thin **config shims** that re-export this package (`eslint.config.mjs`,
  `commitlint.config.mjs`, `.lintstagedrc.mjs`, and the `prettier` key in
  `package.json`) so config stays in sync via `npm update`;
- copy the **templates** that can't be referenced — Husky hooks, `.vscode/`,
  `.markdownlint-cli2.jsonc`, the `.github/` **workflows** (CI, CodeQL,
  dependency review, Trivy, release-please) and **governance** (PR template,
  `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, issue templates), plus a
  `README.md` skeleton if one is missing;
- add npm **scripts** (`lint`, `lint:fix`, `lint:md`, `format`, `format:check`,
  `type-check`, `prepare`);
- install the required dev dependencies and set up Husky.

Existing files are left untouched unless you pass `--force`.

```bash
npx ladevconfig init --next        # force the Next.js preset
npx ladevconfig init --node        # force the base (Node) preset
npx ladevconfig init --private     # private repo: skip GHAS workflows (auto-detected via gh)
npx ladevconfig init --jest        # scaffold Jest (ts-jest)
npx ladevconfig init --vitest      # scaffold Vitest (alternative to Jest)
npx ladevconfig init --scorecard   # also add the OSSF Scorecard workflow (public repos)
npx ladevconfig init --lighthouse  # also add a Lighthouse CI workflow (web apps)
npx ladevconfig init --skills      # also add Claude Code skills (design-craft for UI/UX)
npx ladevconfig init --publish     # also add npm publish-on-release (needs NPM_TOKEN secret)
npx ladevconfig init --sonar       # also add SonarCloud analysis (needs SONAR_TOKEN secret)
npx ladevconfig init --no-install  # scaffold only, install deps yourself
```

### Public vs private repos

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

The `--publish` workflow publishes on a GitHub Release (created when a
release-please PR is merged). Add an `NPM_TOKEN` repository secret (an npm
automation token) for it to authenticate.

After running, fill the placeholders in `.github/CODEOWNERS` (`@OWNER`) and the
security contact in `.github/SECURITY.md`.

## Manual usage (without the CLI)

Each config is also importable directly:

```js
// eslint.config.mjs
export { default } from 'ladevconfig/eslint/next'; // or 'ladevconfig/eslint/base'

// extend it:
import base from 'ladevconfig/eslint/base';
export default [...base, { rules: { 'no-console': 'off' } }];
```

```jsonc
// package.json
{ "prettier": "ladevconfig/prettier" }
```

```js
// commitlint.config.mjs
export { default } from 'ladevconfig/commitlint';

// .lintstagedrc.mjs
export { default } from 'ladevconfig/lint-staged';

// jest.config.mjs (Node + ts-jest)
export { default } from 'ladevconfig/jest';

// vitest.config.mjs (alternative to Jest)
import { defineConfig } from 'vitest/config';
import base from 'ladevconfig/vitest';
export default defineConfig(base);
```

```jsonc
// tsconfig.json — extend a shared base (base / node / next)
{
  "extends": "ladevconfig/tsconfig/node.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## What's inside

- **ESLint** — `ladevconfig/eslint/base` (Node) / `ladevconfig/eslint/next`
  (base + `eslint-config-next`). Flat config: JS + typescript-eslint + Prettier.
- **Prettier** — `ladevconfig/prettier` (100 width, single quotes, es5 commas).
- **commitlint** — `ladevconfig/commitlint` (Conventional Commits).
- **lint-staged** — `ladevconfig/lint-staged` (ESLint/Prettier/markdownlint on staged files).
- **TypeScript** — `ladevconfig/tsconfig/{base,node,next}.json` (strict base + Node/Next variants).
- **Jest / Vitest** — `ladevconfig/jest` (ts-jest) or `ladevconfig/vitest`; opt-in via `--jest` / `--vitest`.
- **GitHub workflows** — CI, CodeQL, dependency review, Trivy, release-please; opt-in: Scorecard, Lighthouse, npm-publish, SonarCloud.
- **Governance** — `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, PR & issue templates.
- **EditorConfig** — `templates/editorconfig` (LF, UTF-8, 2-space).
- **Node version** — `.nvmrc`; CI reads it via `node-version-file`.
- **Claude Code skills** — `design-craft` (a UX/visual-design protocol); opt-in via `--skills`.

## Not included (and why)

- **Babel / Webpack** — frameworks own this layer. Next.js uses SWC + webpack/
  Turbopack (configure via `next.config.js`); Vite/Vitest use esbuild + Rollup;
  plain TS libraries build with `tsc`/tsup. A shared Babel or Webpack config
  would conflict or go unused. (A `tsup`/Rollup preset can be added if a
  non-framework browser library ever needs bundling.)
| markdownlint    | `templates/markdownlint-cli2.jsonc`      | tuned to coexist with Prettier                  |
| Husky hooks     | `templates/husky/*`                      | pre-commit → lint-staged, commit-msg → commitlint |
| CI              | `templates/github/workflows/ci.yml`      | type-check, lint, lint:md, format, build (each `--if-present`) |
| GHAS            | `codeql.yml`, `dependency-review.yml`    | code scanning + vulnerable-dependency gate      |
| Trivy           | `templates/github/workflows/trivy.yml`   | deps + secrets + IaC scan → code scanning (SARIF) |
| Scorecard       | `templates/github/workflows/scorecard.yml` | OSSF supply-chain posture (opt-in, `--scorecard`) |
| Releases        | `templates/github/workflows/release-please.yml` + config | semantic version bumps, tags & changelog |
| Governance      | `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, PR & issue templates | project docs & review routing |
| Editor          | `templates/vscode/*`                     | format + ESLint/markdownlint fix on save        |

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

Consumers pick up changes with `npm update ladevconfig` (shims) — template files
are re-synced by re-running `npx ladevconfig init --force`.
