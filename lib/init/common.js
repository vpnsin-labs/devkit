// Language-agnostic scaffolding shared by every `devkit init` run: editor
// config (EditorConfig + VS Code), markdownlint, cspell, the README skeleton,
// Claude Code skills, the git-ignored temp/ scratch workspace, and the
// placeholder values used when rendering the governance docs.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOST_LABEL } from './context.js';

// ── Editor ──────────────────────────────────────────────────────────────────
// VS Code extensions added on top of the language set when the repo lives in
// Azure Repos: pipeline YAML schema/IntelliSense and Azure Repos PR integration.
export const AZURE_VSCODE_EXTENSIONS = ['ms-azure-devops.azure-pipelines', 'ms-vscode.azure-repos'];
// …and for GitHub-hosted Python/.NET repos (the Node extension list already has these).
export const GITHUB_VSCODE_EXTENSIONS = [
  'github.vscode-pull-request-github',
  'github.vscode-github-actions',
];

export function scaffoldEditor(ctx) {
  const { lang, host, fs } = ctx;
  const { copyTemplate } = fs;
  if (lang === 'node') {
    copyTemplate('vscode/settings.json', '.vscode/settings.json');
    copyTemplate('vscode/extensions.json', '.vscode/extensions.json');
    copyTemplate('editorconfig', '.editorconfig');
  } else {
    // Python/.NET ship their own VS Code + EditorConfig variants (Ruff / C# rules).
    copyTemplate(`${lang}/vscode/settings.json`, '.vscode/settings.json');
    copyTemplate(`${lang}/vscode/extensions.json`, '.vscode/extensions.json');
    copyTemplate(lang === 'dotnet' ? 'dotnet/editorconfig' : 'editorconfig', '.editorconfig');
  }
  if (host === 'azure')
    addVscodeExtensions(
      ctx,
      AZURE_VSCODE_EXTENSIONS,
      'Azure DevOps (Azure Pipelines YAML + Azure Repos PRs)'
    );
  else if (lang !== 'node')
    addVscodeExtensions(ctx, GITHUB_VSCODE_EXTENSIONS, 'GitHub (PRs + Actions workflows)');
}

// Insert extension ids into .vscode/extensions.json (JSONC) without disturbing
// the comments: append before the closing `]` of the recommendations array.
export function addVscodeExtensions(ctx, ids, heading) {
  const { cwd, log } = ctx;
  const file = join(cwd, '.vscode', 'extensions.json');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  const missing = ids.filter((id) => !text.includes(`"${id}"`));
  if (!missing.length) return log.skip('.vscode/extensions.json (host extensions already listed)');
  const close = text.lastIndexOf(']');
  if (close === -1)
    return log.info('.vscode/extensions.json: no array found, skipping host extensions');
  const before = text.slice(0, close).replace(/\s+$/, '');
  const needsComma = !before.endsWith('[');
  const block =
    `${needsComma ? ',' : ''}\n\n    // ── ${heading} ──\n` +
    missing.map((id) => `    "${id}"`).join(',\n') +
    '\n  ';
  writeFileSync(file, `${before}${block}${text.slice(close)}`);
  log.edit(`.vscode/extensions.json (+${missing.join(', ')})`);
}

export function scaffoldLintConfigs(ctx) {
  const { fs } = ctx;
  fs.copyTemplate('markdownlint-cli2.jsonc', '.markdownlint-cli2.jsonc');
  fs.copyTemplate('cspell.json', 'cspell.json');
}

// ── Docs ────────────────────────────────────────────────────────────────────
const CHECKLIST = {
  node: [
    '- [ ] `npm run type-check` passes',
    '- [ ] `npm run lint` passes (+ `npm run lint:md` if docs changed)',
    '- [ ] `npm run build` succeeds (if applicable)',
    '- [ ] No secrets committed (env values stay in the deploy platform / local `.env`)',
  ],
  python: [
    '- [ ] `uv run ruff check .` and `uv run ruff format --check .` pass',
    '- [ ] `uv run mypy .` passes',
    '- [ ] `uv run pytest` passes (new behaviour has tests)',
    '- [ ] No secrets committed (env values stay in the deploy platform / local `.env`)',
  ],
  dotnet: [
    '- [ ] `dotnet format --verify-no-changes` passes',
    '- [ ] `dotnet build` succeeds with no warnings (warnings are errors)',
    '- [ ] `dotnet test` passes (new behaviour has tests)',
    '- [ ] No secrets committed (use `dotnet user-secrets` / pipeline variables, never appsettings)',
  ],
};

const RELEASE_TOOL = {
  github: { node: 'release-please', python: 'release-please', dotnet: 'release-please' },
  azure: {
    node: 'the Release pipeline (commit-and-tag-version)',
    python: 'the Release pipeline (commitizen)',
    dotnet: 'the Release pipeline (versionize)',
  },
};

const VERSION_FILE = {
  node: '`version` in `package.json`',
  python: '`[project] version` in `pyproject.toml`',
  dotnet: '`<Version>` in `Directory.Build.props`',
};

function releaseFlow(ctx) {
  const { host, lang } = ctx;
  if (host === 'github') {
    return (
      'Merging to `main` opens or updates a **release-please** PR. Merging that PR bumps\n' +
      `${VERSION_FILE[lang]}, writes \`CHANGELOG.md\`, and publishes the GitHub release + tag.`
    );
  }
  const tool = {
    node: '`commit-and-tag-version`',
    python: '`cz bump` (commitizen)',
    dotnet: '`versionize`',
  }[lang];
  return (
    'Run the **Release** pipeline (`.azuredevops/pipelines/release.yml`) from `main`. It runs\n' +
    `${tool} to bump ${VERSION_FILE[lang]}, write \`CHANGELOG.md\`, and push a\n` +
    '`vX.Y.Z` tag back to the repo (the build service needs _Contribute_, _Create tag_ and\n' +
    '_Bypass policies when pushing_ on the repo).'
  );
}

// Placeholder values for the rendered governance docs (PR template, CONTRIBUTING, README).
export function docVars(ctx) {
  const { host, lang, projectName } = ctx;
  return {
    PROJECT_NAME: projectName,
    HOST: HOST_LABEL[host],
    ISSUE_LINK: host === 'azure' ? 'Link the work item: AB#123' : 'Link any issue: Closes #123',
    CHECKLIST: CHECKLIST[lang].join('\n'),
    RELEASE_TOOL: RELEASE_TOOL[host][lang],
    RELEASE_FLOW: releaseFlow(ctx),
    VERSION_FILE: VERSION_FILE[lang],
    REVIEWERS:
      host === 'azure'
        ? 'A required reviewer (branch policy) will review; complete the PR with **squash**.'
        : 'A code owner (see `CODEOWNERS`) will review and merge.',
    CONTRIBUTING_PATH: host === 'azure' ? 'CONTRIBUTING.md' : '.github/CONTRIBUTING.md',
    SECURITY_PATH: host === 'azure' ? 'SECURITY.md' : '.github/SECURITY.md',
    BADGES: badges(ctx),
    SETUP_COMMANDS: SETUP_COMMANDS[lang],
    RUN_COMMAND: RUN_COMMAND[lang],
    CHECK_COMMAND: CHECK_COMMAND[lang],
  };
}

const SETUP_COMMANDS = {
  node: 'npm install',
  python: 'uv sync --all-groups\nuv run pre-commit install',
  dotnet: 'dotnet tool restore\ngit config core.hooksPath .githooks\ndotnet restore',
};
const RUN_COMMAND = {
  node: 'npm run dev',
  python: 'uv run uvicorn app.main:app --reload',
  dotnet: 'dotnet run --project src/Api',
};
const CHECK_COMMAND = {
  node: 'npm run lint && npm run type-check && npm run lint:md && npm test',
  python: 'make check',
  dotnet: 'dotnet build && dotnet format --verify-no-changes && dotnet test',
};

// Azure Pipelines build badge for the CI pipeline (named "CI" by convention); the
// value ends with a blank line so the README keeps a clean paragraph break. GitHub
// repos get nothing (the line placeholder disappears).
function badges(ctx) {
  if (ctx.host !== 'azure') return '';
  const org = encodeURIComponent(ctx.azure?.org ?? 'YOUR_ORG');
  const project = encodeURIComponent(ctx.azure?.project ?? 'YOUR_PROJECT');
  const base =
    ctx.azure?.host === 'visualstudio.com'
      ? `https://${org}.visualstudio.com/${project}`
      : `https://dev.azure.com/${org}/${project}`;
  return `[![Build Status](${base}/_apis/build/status/CI?branchName=main)](${base}/_build?definitionName=CI)\n\n`;
}

// Template for CONTRIBUTING.md — one per language, host-neutral via placeholders.
export function contributingTemplate(lang) {
  return lang === 'node' ? 'github/CONTRIBUTING.md' : `github/CONTRIBUTING.${lang}.md`;
}

// Current project version for the release-please manifest.
export function currentVersion(ctx) {
  const { lang, pkg, fs } = ctx;
  if (lang === 'node') return pkg?.version || '0.0.0';
  if (lang === 'python') {
    const m = /^\s*version\s*=\s*["']([^"']+)["']/m.exec(fs.readTarget('pyproject.toml') ?? '');
    return m ? m[1] : '0.1.0';
  }
  const m = /<Version>([^<]+)<\/Version>/.exec(fs.readTarget('Directory.Build.props') ?? '');
  return m ? m[1].trim() : '0.1.0';
}

export function scaffoldReadme(ctx) {
  const { lang, fs } = ctx;
  // Only if absent (never clobbers an existing README).
  fs.renderTemplate(
    lang === 'node' ? 'README.template.md' : `${lang}/README.template.md`,
    'README.md',
    docVars(ctx)
  );
}

export function scaffoldSkills(ctx) {
  const { has, c, fs } = ctx;
  if (!has('--skills')) return;
  console.log(c.bold('\nClaude Code skills'));
  fs.copyTemplate('claude/skills/design-craft/SKILL.md', '.claude/skills/design-craft/SKILL.md');
}

// ── Scratch workspace ───────────────────────────────────────────────────────
// Files in temp/ that make sense for every language, plus per-language extras.
const SCRATCH_COMMON = [
  'format.json',
  'format.env',
  'format.log',
  'format.sh',
  'format.pwsh',
  'format.txt',
  'format.md',
  'format.http',
];
const SCRATCH_BY_LANG = {
  node: ['format.js', 'format.ts'],
  python: ['format.py'],
  dotnet: ['format.cs'],
};

export function scaffoldScratch(ctx) {
  const { lang, c, fs } = ctx;
  console.log(c.bold('\nScratch workspace (temp/)'));
  const files = [...(SCRATCH_BY_LANG[lang] ?? []), ...SCRATCH_COMMON];
  for (const f of files) fs.copyTemplate(`temp/${f}`, `temp/${f}`);
  fs.ensureGitignoreEntry('temp/');
}
