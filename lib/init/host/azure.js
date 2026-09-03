// Azure DevOps host module — Azure Pipelines YAML (CI, release, security,
// Renovate, opt-in Advanced Security / SonarCloud), Azure Artifacts feed wiring,
// the Azure Boards commit-link hook, the code-wiki skeleton, and the Azure Repos
// governance files (PR templates under .azuredevops/, root SECURITY.md and
// CONTRIBUTING.md). Azure Repos has no CODEOWNERS, issue templates or
// Dependabot: path-based reviewers are branch policies (`devkit govern azure`),
// work items live in Azure Boards, and Renovate replaces Dependabot.

import { contributingTemplate, docVars } from '../common.js';
import { readTemplate, render } from '../fs.js';

// Extra, selectable PR templates (Azure Repos lists .azuredevops/pull_request_template/*.md).
const PR_TEMPLATE_VARIANTS = ['hotfix', 'release', 'dependencies'];

// Wiki skeleton published as a code wiki from docs/wiki (see docs/azure-devops.md).
export const WIKI_FILES = [
  '.order',
  'Home.md',
  'Getting-Started.md',
  'Architecture.md',
  'Architecture/.order',
  'Architecture/Decisions.md',
  'Architecture/Decisions/.order',
  'Architecture/Decisions/ADR-0000-template.md',
  'Runbooks.md',
  'Runbooks/.order',
  'Runbooks/Release.md',
  'Runbooks/On-Call.md',
  'Contributing.md',
  '.attachments/.gitkeep',
];

// Optional pipeline blocks rendered into the `# {{…}}` line placeholders of the
// pipeline templates. Empty strings remove the placeholder line.
export function pipelineVars(ctx) {
  const { lang, artifacts } = ctx;
  const vars = {
    ARTIFACTS_AUTH: '',
    ARTIFACTS_ENV: '',
    ARTIFACTS_ENV_ENTRIES: '',
    RENOVATE_HOST_RULES: '',
  };
  if (!artifacts) return vars;
  if (lang === 'node') {
    vars.ARTIFACTS_AUTH =
      '- task: npmAuthenticate@0\n  displayName: Authenticate Azure Artifacts feed (.npmrc)\n  inputs:\n    workingFile: .npmrc';
  } else if (lang === 'dotnet') {
    vars.ARTIFACTS_AUTH =
      '- task: NuGetAuthenticate@1\n  displayName: Authenticate Azure Artifacts feed (nuget.config)';
  } else {
    // uv reads credentials for the index named "azure" (pyproject.toml) from these variables.
    vars.ARTIFACTS_ENV_ENTRIES =
      'UV_INDEX_AZURE_USERNAME: azure\nUV_INDEX_AZURE_PASSWORD: $(System.AccessToken)';
    vars.ARTIFACTS_ENV = [
      'env:',
      ...vars.ARTIFACTS_ENV_ENTRIES.split('\n').map((l) => `  ${l}`),
    ].join('\n');
  }
  vars.RENOVATE_HOST_RULES = `RENOVATE_HOST_RULES: '[{"matchHost":"${artifacts.pkgsHost}","username":"azure","password":"$(System.AccessToken)"}]'`;
  return vars;
}

export function scaffoldAzureCi(ctx) {
  const { lang, has, c, log, fs } = ctx;
  const { copyTemplate, renderTemplate } = fs;
  const vars = pipelineVars(ctx);
  console.log(c.bold('\nAzure Pipelines'));

  // CI: lint, type-check, test, build — the quality gate for PR build validation.
  renderTemplate(`azuredevops/azure-pipelines.${lang}.yml`, 'azure-pipelines.yml', vars);
  // Release: Conventional Commits → version bump + CHANGELOG + tag (manual run from main).
  renderTemplate(
    `azuredevops/pipelines/release.${lang}.yml`,
    '.azuredevops/pipelines/release.yml',
    vars
  );
  // Security: Trivy filesystem scan (deps, secrets, IaC) — free, no extension needed.
  copyTemplate('azuredevops/pipelines/security.yml', '.azuredevops/pipelines/security.yml');
  // Dependency updates: Renovate (self-hosted in a scheduled pipeline) instead of Dependabot.
  renderTemplate('azuredevops/pipelines/renovate.yml', '.azuredevops/pipelines/renovate.yml', vars);
  copyTemplate('azuredevops/renovate.json', 'renovate.json');

  // GitHub Advanced Security for Azure DevOps (CodeQL + dependency scanning) is
  // billed per active committer and must be enabled on the repo first — opt-in.
  if (has('--ghazdo') || has('--advanced-security')) {
    renderTemplate(
      `azuredevops/pipelines/advanced-security.${lang}.yml`,
      '.azuredevops/pipelines/advanced-security.yml',
      vars
    );
  }
  if (has('--scorecard')) log.info('OSSF Scorecard needs a public GitHub repo — skipping');
  if (has('--sonar')) {
    // Needs the SonarCloud marketplace extension + a "SonarCloud" service connection.
    renderTemplate(
      `azuredevops/pipelines/sonarcloud.${lang}.yml`,
      '.azuredevops/pipelines/sonarcloud.yml',
      vars
    );
    if (lang !== 'dotnet') {
      copyTemplate(
        lang === 'python' ? 'sonar-project.python.properties' : 'sonar-project.properties',
        'sonar-project.properties'
      );
    }
  }

  log.info('pipelines only run once created in Azure DevOps: Pipelines → New → Existing YAML file');
  log.info(
    'release + renovate push to the repo: grant the build service Contribute, Create tag, Contribute to PRs'
  );
  log.info(
    'renovate.json: set azureWorkItemId to an open work item so Renovate PRs pass the work-item policy'
  );
}

// Azure Artifacts feed: package-manager config + (via pipelineVars) the auth steps.
export function scaffoldAzureArtifacts(ctx) {
  const { lang, artifacts, c, log, fs } = ctx;
  if (!artifacts) return;
  console.log(c.bold(`\nAzure Artifacts feed (${artifacts.feed})`));
  if (lang === 'dotnet') {
    fs.renderTemplate('azuredevops/artifacts/nuget.config', 'nuget.config', {
      FEED: artifacts.feed,
      NUGET_URL: artifacts.urls.nuget,
    });
    log.info(
      'local auth: install the Azure Artifacts Credential Provider, then `dotnet restore --interactive`'
    );
  } else if (lang === 'node') {
    fs.ensureLine('.npmrc', `registry=${artifacts.urls.npm}`, { label: '.npmrc' });
    fs.ensureLine('.npmrc', 'always-auth=true', { label: '.npmrc' });
    log.info(
      'local auth: `npx vsts-npm-auth -config .npmrc` (Windows) or a PAT in ~/.npmrc (see docs/azure-devops.md)'
    );
  } else {
    fs.appendBlockIfMissing(
      'pyproject.toml',
      '[[tool.uv.index]]',
      render(readTemplate('azuredevops/artifacts/uv-index.toml'), {
        FEED: artifacts.feed,
        PYPI_URL: artifacts.urls.pypi,
      }),
      { label: '[[tool.uv.index]]' }
    );
    log.info(
      'local auth: export UV_INDEX_AZURE_USERNAME=azure UV_INDEX_AZURE_PASSWORD=<PAT with Packaging read>'
    );
  }
}

// prepare-commit-msg hook: append "AB#<id>" from the branch name so the
// work-item-linking policy is satisfied without manual linking. One shared
// script under .githooks/, wired per language (Husky / pre-commit / core.hooksPath).
export function scaffoldAzureHooks(ctx) {
  const { lang, fs } = ctx;
  fs.copyTemplate('azuredevops/hooks/prepare-commit-msg', '.githooks/prepare-commit-msg', {
    executable: true,
  });
  if (lang === 'node') {
    fs.writeFileIfAbsent(
      '.husky/prepare-commit-msg',
      'sh .githooks/prepare-commit-msg "$1" "$2"\n',
      {
        executable: true,
      }
    );
  }
  // python: registered as a pre-commit `prepare-commit-msg` hook in .pre-commit-config.yaml
  // dotnet: core.hooksPath already points at .githooks/
}

export function scaffoldAzureGovernance(ctx) {
  const { lang, c, log, fs } = ctx;
  const vars = docVars(ctx);
  console.log(c.bold('\nGovernance & docs'));
  // Azure Repos auto-applies .azuredevops/pull_request_template.md to new PRs…
  fs.renderTemplate(
    'azuredevops/pull_request_template.md',
    '.azuredevops/pull_request_template.md',
    vars
  );
  // …and offers the files under pull_request_template/ as selectable alternatives.
  for (const variant of PR_TEMPLATE_VARIANTS) {
    fs.renderTemplate(
      `azuredevops/pull_request_template/${variant}.md`,
      `.azuredevops/pull_request_template/${variant}.md`,
      vars
    );
  }
  fs.copyTemplate('azuredevops/SECURITY.md', 'SECURITY.md');
  fs.renderTemplate(contributingTemplate(lang), 'CONTRIBUTING.md', vars);
  log.info(
    'no CODEOWNERS on Azure Repos — set path-based required reviewers as a branch policy (devkit govern azure apply --codeowners)'
  );
}

// docs/wiki: an Azure code-wiki skeleton (.order files, subpage folders, ADR template).
export function scaffoldAzureWiki(ctx) {
  const { wantsWiki, c, log, fs } = ctx;
  if (!wantsWiki) return;
  console.log(c.bold('\nWiki (docs/wiki → publish as an Azure code wiki)'));
  const vars = docVars(ctx);
  for (const f of WIKI_FILES) fs.renderTemplate(`azuredevops/wiki/${f}`, `docs/wiki/${f}`, vars);
  log.info(
    'publish: npx devkit govern azure wiki publish --repo <name>  (or Overview → Wiki → Publish code as wiki → /docs/wiki)'
  );
}

export function azureNextSteps(ctx) {
  const { c } = ctx;
  return {
    placeholders: `Fill placeholders: the security contact in ${c.cyan('SECURITY.md')}, ${c.cyan('azureWorkItemId')} in renovate.json; create the pipelines from ${c.cyan('azure-pipelines.yml')} and ${c.cyan('.azuredevops/pipelines/*.yml')}.`,
    platform: `Protect main: ${c.cyan('npx devkit govern azure apply --repo <name>')} ${c.dim('(reviewers, work-item linking, squash-only, build validation, repo settings)')}`,
  };
}
