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
npx ladevconfig init --scorecard   # also add the OSSF Scorecard workflow (public repos)
npx ladevconfig init --publish     # also add npm publish-on-release (needs NPM_TOKEN secret)
npx ladevconfig init --sonar       # also add SonarCloud analysis (needs SONAR_TOKEN secret)
npx ladevconfig init --no-install  # scaffold only, install deps yourself
```

`--sonar` adds a CI-based SonarCloud scan and a `sonar-project.properties`.
Set a `SONAR_TOKEN` secret, fill in your org/project keys, and turn **off**
Automatic Analysis in SonarCloud (CI and Automatic Analysis can't both run).

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

| Area            | Source                                   | Notes                                           |
| --------------- | ---------------------------------------- | ----------------------------------------------- |
| ESLint (Node)   | `ladevconfig/eslint/base`                | flat config: JS + typescript-eslint + Prettier  |
| ESLint (Next)   | `ladevconfig/eslint/next`                | base + `eslint-config-next` (optional peer dep) |
| Prettier        | `ladevconfig/prettier`                   | 100 print width, single quotes, es5 commas      |
| commitlint      | `ladevconfig/commitlint`                 | Conventional Commits                            |
| lint-staged     | `ladevconfig/lint-staged`                | ESLint/Prettier/markdownlint on staged files    |
| TypeScript      | `ladevconfig/tsconfig/{base,node,next}.json` | strict base + Node/Next variants            |
| Jest            | `ladevconfig/jest`                       | ts-jest preset (opt-in via `--jest`)            |
| EditorConfig    | `templates/editorconfig`                 | LF, UTF-8, 2-space — complements Prettier       |
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
