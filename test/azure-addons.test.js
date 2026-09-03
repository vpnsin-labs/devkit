import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, read, scaffold, seedPackageJson, tree } from './helpers.js';
import { render } from '../lib/init/fs.js';
import { buildArtifacts, parseAzureRemote } from '../lib/init/context.js';

const AZ_REMOTE = 'https://contoso@dev.azure.com/contoso/Platform/_git/payments-api';
const seedAzure = (extra) => (dir) => {
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', AZ_REMOTE);
  if (extra) extra(dir);
};
const PLACEHOLDER = /\{\{[A-Z0-9_]+\}\}/;

test('render: line placeholders insert indented blocks or vanish when empty', () => {
  const tpl = 'steps:\n  # {{AUTH}}\n  - script: npm ci\n<!-- {{BADGES}} -->\n> intro\n';
  assert.equal(
    render(tpl, { AUTH: '- task: A@1\n  inputs:\n    x: 1', BADGES: '' }),
    'steps:\n  - task: A@1\n    inputs:\n      x: 1\n  - script: npm ci\n> intro\n'
  );
  assert.equal(render('a {{X}} b', { X: 1 }), 'a 1 b');
  assert.equal(render('# {{UNKNOWN}}\n', {}), '# {{UNKNOWN}}\n'); // unknown keys stay visible
});

test('parseAzureRemote understands every Azure Repos URL form', () => {
  const expected = {
    host: 'dev.azure.com',
    org: 'contoso',
    project: 'Platform',
    repo: 'payments-api',
  };
  assert.deepEqual(parseAzureRemote(AZ_REMOTE), expected);
  assert.deepEqual(
    parseAzureRemote('git@ssh.dev.azure.com:v3/contoso/Platform/payments-api'),
    expected
  );
  assert.deepEqual(
    parseAzureRemote(
      'https://contoso.visualstudio.com/DefaultCollection/My%20Project/_git/svc.git'
    ),
    { host: 'visualstudio.com', org: 'contoso', project: 'My Project', repo: 'svc' }
  );
  assert.equal(parseAzureRemote('https://github.com/o/r.git'), null);
});

test('buildArtifacts derives the npm / PyPI / NuGet endpoints for every feed scope', () => {
  const remote = parseAzureRemote(AZ_REMOTE);
  const scoped = buildArtifacts('platform-feed', remote);
  assert.equal(
    scoped.urls.npm,
    'https://pkgs.dev.azure.com/contoso/Platform/_packaging/platform-feed/npm/registry/'
  );
  assert.equal(
    scoped.urls.pypi,
    'https://pkgs.dev.azure.com/contoso/Platform/_packaging/platform-feed/pypi/simple/'
  );
  assert.equal(
    scoped.urls.nuget,
    'https://pkgs.dev.azure.com/contoso/Platform/_packaging/platform-feed/nuget/v3/index.json'
  );
  assert.equal(
    buildArtifacts('contoso/shared', null).urls.npm,
    'https://pkgs.dev.azure.com/contoso/_packaging/shared/npm/registry/'
  );
  assert.match(
    buildArtifacts('acme/Proj/feed', null).urls.nuget,
    /\/acme\/Proj\/_packaging\/feed\//
  );
  assert.equal(
    buildArtifacts('feed', { host: 'visualstudio.com', org: 'acme', project: 'P' }).pkgsHost,
    'acme.pkgs.visualstudio.com'
  );
  assert.throws(() => buildArtifacts('feed', null), /could not read the organization/);
});

test('node + azure --artifacts wires .npmrc, npmAuthenticate, the AB# hook, badge and PR variants', () => {
  const r = scaffold('node-az-art', ['--artifacts', 'platform-feed'], {
    seed: seedAzure(seedPackageJson()),
  });
  assert.equal(r.status, 0, r.out);
  const files = tree(r.dir);
  const npmrc = read(r.dir, '.npmrc');
  assert.match(
    npmrc,
    /registry=https:\/\/pkgs\.dev\.azure\.com\/contoso\/Platform\/_packaging\/platform-feed\/npm\/registry\//
  );
  assert.match(npmrc, /always-auth=true/);
  for (const f of ['azure-pipelines.yml', '.azuredevops/pipelines/release.yml']) {
    assert.match(read(r.dir, f), /npmAuthenticate@0/, f);
  }
  assert.match(
    read(r.dir, '.azuredevops/pipelines/renovate.yml'),
    /RENOVATE_HOST_RULES.*pkgs\.dev\.azure\.com/
  );
  assert.match(read(r.dir, 'renovate.json'), /"azureWorkItemId": 0/);
  assert.ok(files.includes('.githooks/prepare-commit-msg'));
  assert.match(read(r.dir, '.husky/prepare-commit-msg'), /sh \.githooks\/prepare-commit-msg/);
  assert.match(
    read(r.dir, 'README.md'),
    /dev\.azure\.com\/contoso\/Platform\/_apis\/build\/status\/CI\?branchName=main/
  );
  for (const v of ['hotfix', 'release', 'dependencies']) {
    assert.ok(files.includes(`.azuredevops/pull_request_template/${v}.md`), v);
    assert.ok(!PLACEHOLDER.test(read(r.dir, `.azuredevops/pull_request_template/${v}.md`)), v);
  }
  assert.ok(!files.some((f) => f.startsWith('docs/wiki/')), 'wiki is opt-in');
});

test('python + azure --artifacts --wiki adds the uv index, env blocks, pre-commit hook and wiki', () => {
  const r = scaffold(
    'py-az-art',
    ['--python', '--backend', '--artifacts', 'platform-feed', '--wiki'],
    {
      seed: seedAzure(),
    }
  );
  assert.equal(r.status, 0, r.out);
  assert.match(
    read(r.dir, 'pyproject.toml'),
    /\[\[tool\.uv\.index\]\][\s\S]*name = "azure"[\s\S]*pypi\/simple\//
  );
  const ci = read(r.dir, 'azure-pipelines.yml');
  assert.equal((ci.match(/UV_INDEX_AZURE_PASSWORD/g) || []).length, 2, 'sync + audit steps');
  assert.match(read(r.dir, '.azuredevops/pipelines/release.yml'), /UV_INDEX_AZURE_USERNAME/);
  const pc = read(r.dir, '.pre-commit-config.yaml');
  assert.match(pc, /default_install_hook_types: \[pre-commit, commit-msg, prepare-commit-msg\]/);
  assert.match(pc, /azure-work-item-link[\s\S]*stages: \[prepare-commit-msg\]/);
  const files = tree(r.dir);
  for (const f of [
    'docs/wiki/.order',
    'docs/wiki/Home.md',
    'docs/wiki/Getting-Started.md',
    'docs/wiki/Architecture/.order',
    'docs/wiki/Architecture/Decisions/ADR-0000-template.md',
    'docs/wiki/Runbooks/On-Call.md',
    'docs/wiki/Runbooks/Release.md',
    'docs/wiki/.attachments/.gitkeep',
  ]) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  assert.equal(
    read(r.dir, 'docs/wiki/.order'),
    'Home\nGetting-Started\nArchitecture\nRunbooks\nContributing\n'
  );
  assert.match(read(r.dir, 'docs/wiki/Getting-Started.md'), /uv sync --all-groups/);
  assert.match(read(r.dir, 'docs/wiki/Runbooks/Release.md'), /cz bump/);
  for (const f of files.filter((x) => x.startsWith('docs/wiki/') && x.endsWith('.md'))) {
    assert.ok(!PLACEHOLDER.test(read(r.dir, f)), `placeholder left in ${f}`);
  }
});

test('dotnet + azure --artifacts writes nuget.config and NuGetAuthenticate steps everywhere a restore happens', () => {
  const r = scaffold(
    'net-az-art',
    ['--dotnet', '--artifacts', 'contoso/Platform/platform-feed', '--sonar', '--ghazdo'],
    {
      seed: seedAzure(),
    }
  );
  assert.equal(r.status, 0, r.out);
  assert.match(
    read(r.dir, 'nuget.config'),
    /pkgs\.dev\.azure\.com\/contoso\/Platform\/_packaging\/platform-feed\/nuget\/v3\/index\.json/
  );
  for (const f of [
    'azure-pipelines.yml',
    '.azuredevops/pipelines/release.yml',
    '.azuredevops/pipelines/sonarcloud.yml',
    '.azuredevops/pipelines/advanced-security.yml',
  ]) {
    assert.match(read(r.dir, f), /NuGetAuthenticate@1/, f);
  }
  assert.ok(tree(r.dir).includes('.githooks/prepare-commit-msg'));
});

test('without --artifacts the pipelines carry no auth steps and no leftover placeholder lines', () => {
  const r = scaffold('node-az-plain', ['--azure'], { seed: seedPackageJson() });
  assert.equal(r.status, 0, r.out);
  for (const f of tree(r.dir).filter((x) => x.endsWith('.yml'))) {
    const text = read(r.dir, f);
    assert.ok(!/Authenticate@/.test(text) && !PLACEHOLDER.test(text), f);
  }
  assert.ok(!read(r.dir, '.azuredevops/pipelines/renovate.yml').includes('RENOVATE_HOST_RULES'));
  assert.match(read(r.dir, 'README.md'), /dev\.azure\.com\/YOUR_ORG\/YOUR_PROJECT/); // no remote → placeholder badge
});

test('Azure-only flags are rejected on GitHub; --artifacts needs a value and an org', () => {
  const a = scaffold('gh-artifacts', ['--github', '--artifacts', 'feed'], {
    seed: seedPackageJson(),
  });
  assert.equal(a.status, 1);
  assert.match(a.out, /only available for Azure Repos/);
  const b = scaffold('az-artifacts-novalue', ['--azure', '--artifacts'], {
    seed: seedPackageJson(),
  });
  assert.equal(b.status, 1);
  assert.match(b.out, /--artifacts needs a feed/);
  const c = scaffold('az-artifacts-noremote', ['--azure', '--artifacts', 'feed'], {
    seed: seedPackageJson(),
  });
  assert.equal(c.status, 1);
  assert.match(c.out, /could not read the organization/);
  const d = scaffold('gh-wiki', ['--github', '--wiki'], { seed: seedPackageJson() });
  assert.equal(d.status, 1);
  assert.match(d.out, /--wiki is only available for Azure Repos/);
});

test('prepare-commit-msg hook appends AB#<id> from the branch name, once, and skips merges', (t) => {
  if (spawnSync('sh', ['-c', 'exit 0']).status !== 0) return t.skip('no POSIX sh available');
  const dir = mkdtempSync(join(tmpdir(), 'devkit-hook-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'dev@example.com');
  git(dir, 'config', 'user.name', 'Dev');
  git(dir, 'commit', '--allow-empty', '-q', '-m', 'chore: init');
  git(dir, 'checkout', '-q', '-b', 'feature/1234-add-health');
  const hook = join(process.cwd(), 'templates', 'azuredevops', 'hooks', 'prepare-commit-msg');
  const msg = join(dir, 'MSG');
  writeFileSync(msg, 'feat: add health endpoint\n');

  assert.equal(spawnSync('sh', [hook, msg], { cwd: dir }).status, 0);
  assert.match(readFileSync(msg, 'utf8'), /^feat: add health endpoint\n\n\nAB#1234\n$/);
  spawnSync('sh', [hook, msg], { cwd: dir });
  assert.equal((readFileSync(msg, 'utf8').match(/AB#1234/g) || []).length, 1, 'idempotent');

  writeFileSync(msg, 'Merge branch x\n');
  spawnSync('sh', [hook, msg, 'merge'], { cwd: dir });
  assert.equal(readFileSync(msg, 'utf8'), 'Merge branch x\n');

  git(dir, 'checkout', '-q', '-b', 'chore/no-number-here');
  writeFileSync(msg, 'chore: tidy\n');
  spawnSync('sh', [hook, msg], { cwd: dir });
  assert.equal(readFileSync(msg, 'utf8'), 'chore: tidy\n');
});
