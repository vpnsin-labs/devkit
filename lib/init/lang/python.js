// Python language module — uv (env + lockfile), Ruff (lint + format), mypy,
// pytest, commitizen (Conventional Commits + release bump) and the pre-commit
// framework for git hooks. Config lives in pyproject.toml; devkit never
// overwrites an existing pyproject — it appends the [tool.*] tables it owns.

import { execSync } from 'node:child_process';
import { readTemplate, render } from '../fs.js';

export const PYTHON_TOOLS = ['ruff', 'mypy', 'pytest', 'pytest-cov', 'commitizen', 'pre-commit'];

// pre-commit entry for the shared .githooks/prepare-commit-msg script (Azure Repos only).
const AB_LINK_HOOK = [
  '# Azure Boards: append AB#<id> from the branch name (satisfies the work-item policy).',
  '- repo: local',
  '  hooks:',
  '    - id: azure-work-item-link',
  '      name: link Azure Boards work item (AB#)',
  '      entry: sh .githooks/prepare-commit-msg',
  '      language: system',
  '      stages: [prepare-commit-msg]',
  '      always_run: true',
].join('\n');

// Split the shared [tool.*] template into blocks separated by blank lines; each
// block's first line ("[tool.ruff]") is the marker used to detect presence.
export function tomlBlocks(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => ({ marker: b.split('\n')[0].trim(), text: b }));
}

export function configurePython(ctx) {
  const { wantsBackend, force, projectName, c, log, fs } = ctx;
  console.log(c.bold('Python tooling (uv · Ruff · mypy · pytest · commitizen · pre-commit)'));

  const tools = readTemplate('python/pyproject.tools.toml');
  const existing = fs.readTarget('pyproject.toml');
  if (existing === null) {
    const header = readTemplate(
      wantsBackend ? 'python/app/backend/pyproject.project.toml' : 'python/pyproject.project.toml'
    );
    fs.writeFileIfAbsent(
      'pyproject.toml',
      `${render(header, { PROJECT_NAME: projectName }).trimEnd()}\n\n${tools}`
    );
  } else {
    // Never clobber project metadata — even with --force only add what is missing.
    if (force)
      log.info('pyproject.toml exists → appending missing [tool.*] tables (never overwritten)');
    for (const block of tomlBlocks(tools)) {
      fs.appendBlockIfMissing('pyproject.toml', block.marker, block.text, { label: block.marker });
    }
  }

  fs.copyTemplate('python/python-version', '.python-version');
  // Azure Repos: also install the prepare-commit-msg hook that links Azure Boards work items.
  const azure = ctx.host === 'azure';
  fs.renderTemplate('python/pre-commit-config.yaml', '.pre-commit-config.yaml', {
    HOOK_TYPES: azure ? 'pre-commit, commit-msg, prepare-commit-msg' : 'pre-commit, commit-msg',
    AB_LINK_HOOK: azure ? AB_LINK_HOOK : '',
  });
  fs.copyTemplate('python/Makefile', 'Makefile');
  fs.copyTemplate('python/gitignore', '.gitignore');
}

export function scaffoldPythonStarter(ctx) {
  const { wantsBackend, c, fs } = ctx;
  if (!wantsBackend) return;
  const { copyTemplate } = fs;
  console.log(c.bold('\nBackend app (FastAPI)'));
  copyTemplate('python/app/backend/src/app/__init__.py', 'src/app/__init__.py');
  copyTemplate('python/app/backend/src/app/main.py', 'src/app/main.py');
  // settings.py embeds the distribution name so /health can report the installed version.
  fs.renderTemplate('python/app/backend/src/app/settings.py', 'src/app/settings.py', {
    PROJECT_NAME: ctx.projectName,
  });
  copyTemplate('python/app/backend/src/app/health.py', 'src/app/health.py');
  copyTemplate('python/app/backend/tests/__init__.py', 'tests/__init__.py');
  copyTemplate('python/app/backend/tests/test_health.py', 'tests/test_health.py');
  copyTemplate('python/app/backend/env.example', '.env.example');
  copyTemplate('python/app/backend/Dockerfile', 'Dockerfile');
  copyTemplate('python/app/backend/dockerignore', '.dockerignore');
}

function available(cmd, cwd) {
  try {
    execSync(cmd, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function installPython(ctx) {
  const { noInstall, cwd, c, log } = ctx;
  console.log(c.bold('\nDependencies'));
  const sync = 'uv sync --all-groups';
  const hooks = 'uv run pre-commit install';
  if (noInstall) {
    log.info('Skipped (--no-install). Install manually:');
    log.info(sync);
    log.info(hooks);
    return;
  }
  if (!available('uv --version', cwd)) {
    console.log(c.yellow('  ! uv not found — install it, then run:'));
    log.info(
      'winget install astral-sh.uv   |   brew install uv   |   curl -LsSf https://astral.sh/uv/install.sh | sh'
    );
    log.info(sync);
    log.info(hooks);
    return;
  }
  try {
    log.info(sync);
    execSync(sync, { cwd, stdio: 'inherit' }); // creates .venv + uv.lock (commit the lock)
  } catch {
    console.log(c.yellow('\n  ! uv sync failed — run it manually:'));
    log.info(sync);
  }
  console.log(c.bold('\nGit hooks (pre-commit)'));
  try {
    execSync(hooks, { cwd, stdio: 'ignore' });
    log.info('pre-commit + commit-msg hooks installed');
  } catch {
    log.info(`Run "${hooks}" once inside the git repo to finish hook installation.`);
  }
}

export function pythonNextSteps(ctx) {
  const { c, wantsBackend } = ctx;
  const verify = [
    `One-time normalise formatting:   ${c.cyan('uv run ruff format .')} ${c.dim('(or: make format)')}`,
    `Verify the gates:                ${c.cyan('make check')} ${c.dim('= ruff check · ruff format --check · mypy · pytest')}`,
  ];
  const run = wantsBackend
    ? [
        `Run the API:                     ${c.cyan('uv run uvicorn app.main:app --reload')} ${c.dim('(copy .env.example → .env first; http://localhost:8000/health)')}`,
      ]
    : [];
  return { verify, run };
}
