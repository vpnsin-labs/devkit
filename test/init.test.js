import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { git, read, run, scaffold, seedPackageJson, tree } from './helpers.js';

// The Node + GitHub scaffold must stay exactly what it was before the Python/.NET/
// Azure work (captured from the previous single-file CLI).
const NODE_GITHUB_DEFAULT = [
  '.editorconfig',
  '.github/CODEOWNERS',
  '.github/CONTRIBUTING.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/SECURITY.md',
  '.github/dependabot.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/dependency-review.yml',
  '.github/workflows/release-please.yml',
  '.github/workflows/trivy.yml',
  '.gitignore',
  '.husky/commit-msg',
  '.husky/pre-commit',
  '.lintstagedrc.mjs',
  '.markdownlint-cli2.jsonc',
  '.npmrc',
  '.nvmrc',
  '.release-please-manifest.json',
  '.vscode/extensions.json',
  '.vscode/settings.json',
  'README.md',
  'commitlint.config.ts',
  'cspell.json',
  'eslint.config.ts',
  'package.json',
  'release-please-config.json',
  'temp/format.env',
  'temp/format.http',
  'temp/format.js',
  'temp/format.json',
  'temp/format.log',
  'temp/format.md',
  'temp/format.pwsh',
  'temp/format.sh',
  'temp/format.ts',
  'temp/format.txt',
  'tsconfig.json',
];

const noPlaceholders = (dir) => {
  for (const f of tree(dir)) {
    if (
      /\.(md|yml|yaml|json|toml|py|cs|ts|mjs|props|slnx|txt|properties|sh|Makefile)$|^(Makefile|\.githooks\/.*)$/.test(
        f
      )
    ) {
      assert.ok(!/{{[A-Z0-9_]+}}/.test(read(dir, f)), `unrendered placeholder in ${f}`);
    }
  }
};

test('node + github (default) produces the historical file set', () => {
  const r = scaffold('node-default', ['--public'], { seed: seedPackageJson('golden') });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(tree(r.dir), NODE_GITHUB_DEFAULT);
  assert.match(read(r.dir, '.github/PULL_REQUEST_TEMPLATE.md'), /release-please reads it/);
  assert.match(read(r.dir, '.github/PULL_REQUEST_TEMPLATE.md'), /Closes #123/);
  assert.match(read(r.dir, '.github/PULL_REQUEST_TEMPLATE.md'), /`npm run type-check` passes/);
  assert.match(read(r.dir, '.github/CONTRIBUTING.md'), /A code owner \(see `CODEOWNERS`\)/);
  const pkg = JSON.parse(read(r.dir, 'package.json'));
  assert.equal(pkg.scripts.lint, 'eslint .');
  assert.equal(pkg.prettier, '@vpnsin-labs/devkit/prettier');
  noPlaceholders(r.dir);
});

test('node + github --backend adds the Express starter and scripts', () => {
  const r = scaffold('node-backend', ['--backend', '--public'], { seed: seedPackageJson() });
  assert.equal(r.status, 0, r.out);
  const files = tree(r.dir);
  for (const f of [
    'src/server.ts',
    'src/app.ts',
    'src/routes/health.ts',
    'Dockerfile',
    'render.yaml',
    '.env.example',
  ]) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  assert.equal(JSON.parse(read(r.dir, 'package.json')).scripts.dev, 'tsx watch src/server.ts');
});

test('python + github --backend scaffolds FastAPI + uv/Ruff/mypy/pytest/commitizen tooling', () => {
  const r = scaffold('py-api', ['--python', '--backend', '--github', '--public']);
  assert.equal(r.status, 0, r.out);
  const files = tree(r.dir);
  for (const f of [
    'pyproject.toml',
    '.python-version',
    '.pre-commit-config.yaml',
    'Makefile',
    'src/app/main.py',
    'src/app/settings.py',
    'src/app/health.py',
    'tests/test_health.py',
    'Dockerfile',
    '.github/workflows/ci.yml',
    '.github/workflows/codeql.yml',
    '.github/dependabot.yml',
    'release-please-config.json',
    'temp/format.py',
  ]) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  for (const f of [
    'eslint.config.ts',
    'tsconfig.json',
    '.husky/pre-commit',
    '.nvmrc',
    'temp/format.ts',
    'package.json',
  ]) {
    assert.ok(!files.includes(f), `unexpected Node file ${f}`);
  }
  const py = read(r.dir, 'pyproject.toml');
  assert.match(py, /^\[project\]/m);
  assert.match(py, /^\[tool\.ruff\]/m);
  assert.match(py, /^\[tool\.commitizen\]/m);
  assert.match(py, /^\[dependency-groups\]/m);
  assert.match(read(r.dir, 'src/app/settings.py'), /DISTRIBUTION = "[a-z0-9-]+"/);
  assert.match(read(r.dir, '.github/workflows/ci.yml'), /astral-sh\/setup-uv/);
  assert.match(read(r.dir, '.github/workflows/codeql.yml'), /languages: python/);
  assert.match(read(r.dir, '.github/dependabot.yml'), /package-ecosystem: uv/);
  assert.match(read(r.dir, 'release-please-config.json'), /"release-type": "python"/);
  assert.equal(JSON.parse(read(r.dir, '.release-please-manifest.json'))['.'], '0.1.0');
  assert.match(read(r.dir, '.github/PULL_REQUEST_TEMPLATE.md'), /uv run mypy/);
  assert.match(read(r.dir, '.vscode/extensions.json'), /charliermarsh\.ruff/);
  assert.match(read(r.dir, '.vscode/extensions.json'), /github\.vscode-pull-request-github/);
  noPlaceholders(r.dir);
});

test('python init appends only the missing [tool.*] tables to an existing pyproject.toml', () => {
  const r = scaffold('py-existing', ['--python', '--github', '--private'], {
    seed: (dir) =>
      writeFileSync(
        join(dir, 'pyproject.toml'),
        '[project]\nname = "legacy"\nversion = "2.3.4"\n\n[tool.ruff]\nline-length = 88\n'
      ),
  });
  assert.equal(r.status, 0, r.out);
  const py = read(r.dir, 'pyproject.toml');
  assert.match(py, /line-length = 88/); // user's ruff config kept
  assert.equal(py.match(/^\[tool\.ruff\]/gm).length, 1); // not duplicated
  assert.match(py, /^\[tool\.mypy\]/m);
  assert.match(py, /^\[tool\.commitizen\]/m);
  assert.equal(JSON.parse(read(r.dir, '.release-please-manifest.json'))['.'], '2.3.4');
  assert.match(r.out, /\[tool\.ruff\] already present/);
  // private repo → no GHAS workflows
  assert.ok(!tree(r.dir).includes('.github/workflows/codeql.yml'));
});

test('dotnet + github --backend scaffolds the minimal API, hooks and analyzers config', () => {
  const r = scaffold('net-api', ['--dotnet', '--backend', '--github', '--public']);
  assert.equal(r.status, 0, r.out);
  const files = tree(r.dir);
  for (const f of [
    'global.json',
    'Directory.Build.props',
    '.config/dotnet-tools.json',
    '.githooks/pre-commit',
    '.githooks/commit-msg',
    'src/Api/Api.csproj',
    'src/Api/Program.cs',
    'tests/Api.Tests/Api.Tests.csproj',
    'tests/Api.Tests/HealthTests.cs',
    'Dockerfile',
    '.github/workflows/ci.yml',
    'temp/format.cs',
  ]) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  const slnx = files.find((f) => f.endsWith('.slnx'));
  assert.ok(slnx, 'solution file missing');
  assert.match(slnx, /^[A-Z][A-Za-z0-9]*\.slnx$/); // PascalCase from the directory name
  assert.match(read(r.dir, '.editorconfig'), /csharp_style_namespace_declarations/);
  assert.match(read(r.dir, '.github/workflows/codeql.yml'), /build-mode: none/);
  assert.match(read(r.dir, '.github/dependabot.yml'), /package-ecosystem: nuget/);
  assert.match(read(r.dir, 'release-please-config.json'), /Directory\.Build\.props/);
  assert.match(
    read(r.dir, '.github/PULL_REQUEST_TEMPLATE.md'),
    /dotnet format --verify-no-changes/
  );
  assert.ok(!files.includes('.husky/pre-commit'));
  noPlaceholders(r.dir);
});

test('node + azure swaps GitHub Actions for Azure Pipelines and .azuredevops governance', () => {
  const r = scaffold('node-azure', ['--azure'], { seed: seedPackageJson() });
  assert.equal(r.status, 0, r.out);
  const files = tree(r.dir);
  for (const f of [
    'azure-pipelines.yml',
    '.azuredevops/pipelines/release.yml',
    '.azuredevops/pipelines/security.yml',
    '.azuredevops/pipelines/renovate.yml',
    '.azuredevops/pull_request_template.md',
    'renovate.json',
    'SECURITY.md',
    'CONTRIBUTING.md',
    '.husky/pre-commit',
    'eslint.config.ts',
  ]) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  assert.ok(!files.some((f) => f.startsWith('.github/')), 'no .github/ on Azure');
  assert.ok(!files.includes('release-please-config.json'));
  assert.match(read(r.dir, 'azure-pipelines.yml'), /UseNode@1/);
  assert.match(read(r.dir, '.azuredevops/pipelines/release.yml'), /commit-and-tag-version/);
  assert.match(read(r.dir, '.azuredevops/pull_request_template.md'), /AB#123/);
  assert.match(read(r.dir, 'CONTRIBUTING.md'), /Release\*\* pipeline/);
  assert.match(read(r.dir, 'README.md'), /\]\(CONTRIBUTING\.md\)/);
  assert.match(read(r.dir, '.vscode/extensions.json'), /ms-azure-devops\.azure-pipelines/);
  assert.match(r.out, /Azure DevOps, private repo/);
  noPlaceholders(r.dir);
});

test('python + azure with --ghazdo --sonar adds the opt-in pipelines', () => {
  const r = scaffold('py-azure', ['--python', '--azure', '--ghazdo', '--sonar', '--backend']);
  assert.equal(r.status, 0, r.out);
  const files = tree(r.dir);
  for (const f of [
    '.azuredevops/pipelines/advanced-security.yml',
    '.azuredevops/pipelines/sonarcloud.yml',
    'sonar-project.properties',
    '.azuredevops/pipelines/release.yml',
  ]) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  assert.match(read(r.dir, '.azuredevops/pipelines/advanced-security.yml'), /languages: python/);
  assert.match(read(r.dir, '.azuredevops/pipelines/release.yml'), /cz bump/);
  assert.match(read(r.dir, 'sonar-project.properties'), /sonar\.python\.version/);
  noPlaceholders(r.dir);
});

test('dotnet + azure uses UseDotNet, versionize and the dotnet Sonar scanner mode', () => {
  const r = scaffold('net-azure', ['--dotnet', '--azure', '--sonar']);
  assert.equal(r.status, 0, r.out);
  assert.match(read(r.dir, 'azure-pipelines.yml'), /UseDotNet@2/);
  assert.match(read(r.dir, '.azuredevops/pipelines/release.yml'), /versionize/);
  assert.match(read(r.dir, '.azuredevops/pipelines/sonarcloud.yml'), /scannerMode: dotnet/);
  assert.ok(!tree(r.dir).includes('sonar-project.properties'));
  noPlaceholders(r.dir);
});

test('host is auto-detected from an Azure Repos origin remote', () => {
  const r = scaffold('detect-azure', [], {
    seed: (dir) => {
      seedPackageJson()(dir);
      git(dir, 'init', '-q');
      git(
        dir,
        'remote',
        'add',
        'origin',
        'https://contoso@dev.azure.com/contoso/Platform/_git/payments-api'
      );
    },
  });
  assert.equal(r.status, 0, r.out);
  assert.ok(tree(r.dir).includes('azure-pipelines.yml'));
  assert.ok(!tree(r.dir).some((f) => f.startsWith('.github/')));
});

test('language is auto-detected from marker files', () => {
  const py = scaffold('detect-py', ['--github', '--private'], {
    seed: (dir) =>
      writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\nversion = "0.0.1"\n'),
  });
  assert.equal(py.status, 0, py.out);
  assert.match(py.out, /devkit init \(Python/);

  const net = scaffold('detect-net', ['--github', '--private'], {
    seed: (dir) => {
      mkdirSync(join(dir, 'src'));
      writeFileSync(join(dir, 'Thing.csproj'), '<Project Sdk="Microsoft.NET.Sdk"></Project>');
    },
  });
  assert.equal(net.status, 0, net.out);
  assert.match(net.out, /devkit init \(\.NET/);
  assert.ok(tree(net.dir).includes('Directory.Build.props'));
});

test('re-running is idempotent (nothing created, tree unchanged)', () => {
  const first = scaffold('idempotent', ['--python', '--azure', '--backend']);
  assert.equal(first.status, 0, first.out);
  const before = tree(first.dir).map((f) => [f, read(first.dir, f)]);

  const second = run(first.dir, ['--python', '--azure', '--backend']);
  assert.equal(second.status, 0, second.out);
  assert.ok(
    !/^\s+\+ /m.test(second.stdout),
    `second run created files:
${second.stdout}`
  );
  assert.deepEqual(
    tree(first.dir).map((f) => [f, read(first.dir, f)]),
    before
  );
});

test('invalid flag combinations fail with a clear message', () => {
  const a = scaffold('bad-frontend', ['--python', '--frontend']);
  assert.equal(a.status, 1);
  assert.match(a.out, /--frontend is Node\.js-only/);

  const b = scaffold('bad-publish', ['--azure', '--publish'], { seed: seedPackageJson() });
  assert.equal(b.status, 1);
  assert.match(b.out, /only available for GitHub-hosted repos/);

  const c = scaffold('bad-empty', []);
  assert.equal(c.status, 1);
  assert.match(c.out, /--node \| --python \| --dotnet/);

  const d = scaffold('bad-both', ['--backend', '--frontend'], { seed: seedPackageJson() });
  assert.equal(d.status, 1);
  assert.match(d.out, /Use --fullstack/);
});
