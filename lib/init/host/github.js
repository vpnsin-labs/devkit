// GitHub host module — GitHub Actions workflows (CI, release-please, GHAS,
// opt-in Scorecard/Sonar/Lighthouse/publish), Dependabot, and the .github/
// governance files (PR template, SECURITY, CONTRIBUTING, CODEOWNERS, issue
// templates). Workflow templates are per language where the toolchain differs.

import { contributingTemplate, currentVersion, docVars } from '../common.js';

const AUDIT_STEP = {
  node: 'the npm audit step in ci.yml',
  python: 'the pip-audit step in ci.yml',
  dotnet: 'the `dotnet list package --vulnerable` step in ci.yml',
};

function perLang(base, lang, ext) {
  return lang === 'node' ? `${base}.${ext}` : `${base}.${lang}.${ext}`;
}

export function scaffoldGithubCi(ctx) {
  const { lang, has, isPrivate, isMonorepo, c, log, fs } = ctx;
  const { copyTemplate } = fs;
  console.log(c.bold('\nGitHub workflows'));

  // Always free on public + private:
  copyTemplate(perLang('github/workflows/ci', lang, 'yml'), '.github/workflows/ci.yml');

  // With --publish, use the release-please workflow that ALSO publishes to npm when
  // the release PR is merged. (A GITHUB_TOKEN-created release can't trigger a
  // separate on:release workflow, so the publish step must be integrated here.)
  copyTemplate(
    has('--publish')
      ? 'github/workflows/release-please-publish.yml'
      : 'github/workflows/release-please.yml',
    '.github/workflows/release-please.yml'
  );
  const rpConfig =
    lang === 'node'
      ? isMonorepo
        ? 'release-please-config.fullstack.json'
        : 'release-please-config.json'
      : `release-please-config.${lang}.json`;
  copyTemplate(rpConfig, 'release-please-config.json');
  fs.writeFileIfAbsent(
    '.release-please-manifest.json',
    `${JSON.stringify(
      isMonorepo ? { backend: '0.0.0', frontend: '0.0.0' } : { '.': currentVersion(ctx) },
      null,
      2
    )}\n`
  );
  copyTemplate(perLang('dependabot', lang, 'yml'), '.github/dependabot.yml');

  if (isPrivate) {
    log.info(
      'private repo → skipping GHAS workflows (CodeQL/Trivy/Dependency Review need a paid licence)'
    );
    log.info(`dependency security covered by Dependabot + ${AUDIT_STEP[lang]}`);
    log.info(
      'Actions minutes are metered on private repos — workflows ship with timeout-minutes + concurrency caps to limit spend'
    );
  } else {
    // GHAS — free on public repos:
    copyTemplate(perLang('github/workflows/codeql', lang, 'yml'), '.github/workflows/codeql.yml');
    copyTemplate(
      'github/workflows/dependency-review.yml',
      '.github/workflows/dependency-review.yml'
    );
    copyTemplate('github/workflows/trivy.yml', '.github/workflows/trivy.yml');
  }

  if (has('--scorecard')) {
    if (isPrivate) log.info('Scorecard needs a public repo — skipping');
    else copyTemplate('github/workflows/scorecard.yml', '.github/workflows/scorecard.yml');
  }
  if (has('--publish')) {
    // Manual recovery workflow; auto-publish lives in release-please.yml (above).
    copyTemplate('github/workflows/publish.yml', '.github/workflows/publish.yml');
  }
  if (has('--sonar')) {
    if (lang === 'dotnet') {
      // C# analysis must wrap the build with dotnet-sonarscanner (begin/end); the
      // generic scan action does not analyse compiled languages.
      copyTemplate('github/workflows/sonarqube.dotnet.yml', '.github/workflows/sonarqube.yml');
    } else {
      copyTemplate('github/workflows/sonarqube.yml', '.github/workflows/sonarqube.yml');
      copyTemplate(
        lang === 'python' ? 'sonar-project.python.properties' : 'sonar-project.properties',
        'sonar-project.properties'
      );
    }
  }
  if (has('--lighthouse')) {
    copyTemplate('github/workflows/lighthouse.yml', '.github/workflows/lighthouse.yml');
    copyTemplate('lighthouserc.json', 'lighthouserc.json');
  }
}

export function scaffoldGithubGovernance(ctx) {
  const { lang, c, fs } = ctx;
  const vars = docVars(ctx);
  console.log(c.bold('\nGovernance & docs'));
  fs.renderTemplate('github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.md', vars);
  fs.copyTemplate('github/SECURITY.md', '.github/SECURITY.md');
  fs.renderTemplate(contributingTemplate(lang), '.github/CONTRIBUTING.md', vars);
  fs.copyTemplate('github/CODEOWNERS', '.github/CODEOWNERS');
  fs.copyTemplate('github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/bug_report.yml');
  fs.copyTemplate(
    'github/ISSUE_TEMPLATE/feature_request.yml',
    '.github/ISSUE_TEMPLATE/feature_request.yml'
  );
  fs.copyTemplate('github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/config.yml');
}

export function githubNextSteps(ctx) {
  const { c } = ctx;
  return {
    placeholders: `Fill placeholders: ${c.cyan('.github/CODEOWNERS')} (@OWNER) and the security contact in ${c.cyan('.github/SECURITY.md')}.`,
    platform: 'In GitHub repo settings, enable Code scanning, Secret scanning & Dependency graph.',
  };
}
