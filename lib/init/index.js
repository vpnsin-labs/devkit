// `devkit init` — orchestrates the scaffold. Two independent axes decide what is
// written:
//
//   language  node (default when package.json exists) | python | dotnet
//   host      github (default) | azure  — detected from the origin remote
//
// Files that CAN reference this package (ESLint, Prettier, commitlint,
// lint-staged in Node repos) are written as thin shims so they stay in sync;
// everything else (hooks, pipelines, editor settings, docs, Python/.NET config)
// is copied from templates and re-synced with --force.

import { c, log } from './fs.js';
import { buildContext, HOST_LABEL, LANG_LABEL } from './context.js';
import {
  scaffoldEditor,
  scaffoldLintConfigs,
  scaffoldReadme,
  scaffoldScratch,
  scaffoldSkills,
} from './common.js';
import {
  configureNode,
  installNode,
  mergePackageJson,
  nodeNextSteps,
  scaffoldNodeHooks,
  scaffoldNodeStarters,
  scaffoldNodeVersionFiles,
} from './lang/node.js';
import {
  configurePython,
  installPython,
  pythonNextSteps,
  scaffoldPythonStarter,
} from './lang/python.js';
import {
  configureDotnet,
  dotnetNextSteps,
  installDotnet,
  scaffoldDotnetStarter,
} from './lang/dotnet.js';
import { githubNextSteps, scaffoldGithubCi, scaffoldGithubGovernance } from './host/github.js';
import {
  azureNextSteps,
  scaffoldAzureArtifacts,
  scaffoldAzureCi,
  scaffoldAzureGovernance,
  scaffoldAzureHooks,
  scaffoldAzureWiki,
} from './host/azure.js';

export const HELP = `
${c.bold('devkit')} — shared dev tooling for Node.js/Next.js, Python and .NET repos on GitHub or Azure Repos

${c.bold('Usage:')}  npx devkit init [options]

${c.bold('Language')} ${c.dim('(auto-detected from package.json / pyproject.toml / *.csproj|*.sln; flags override)')}
  --node         Node.js: ESLint + Prettier + commitlint + Husky + TypeScript (base preset)
  --next         Node.js with the Next.js ESLint preset
  --python       Python: uv + Ruff + mypy + pytest + commitizen + pre-commit (pyproject.toml)
  --dotnet       .NET: global.json + Directory.Build.props + .editorconfig + dotnet format hooks + versionize

${c.bold('Host')} ${c.dim('(auto-detected from the git origin remote; flags override)')}
  --github       GitHub Actions + Dependabot + release-please + .github/ governance (default)
  --azure        Azure Pipelines + Renovate + release pipeline + .azuredevops/ PR template (alias --ado)

${c.bold('App starters')}
  --backend      runnable API starter: Express+TS (node) · FastAPI (python) · ASP.NET Core minimal API (dotnet)
  --frontend     Next.js (App Router) + TypeScript frontend                       ${c.dim('[node]')}
  --fullstack    Next.js + Express + MongoDB monorepo (npm workspaces; alias --mern) ${c.dim('[node]')}

${c.bold('Options')}
  --private      private repo: skip GHAS workflows (Dependabot + audit step instead) ${c.dim('[github]')}
  --public       public repo: include GHAS workflows (default; auto-detected via gh)  ${c.dim('[github]')}
  --jest         also scaffold Jest (ts-jest) config, scripts and deps              ${c.dim('[node]')}
  --vitest       also scaffold Vitest config, scripts and deps                      ${c.dim('[node]')}
  --scorecard    also add the OSSF Scorecard workflow (public GitHub repos)
  --publish      auto-publish to npm when the release-please PR merges (needs NPM_TOKEN) ${c.dim('[node · github]')}
  --sonar        also add SonarCloud analysis (needs SONAR_TOKEN / service connection)
  --lighthouse   also add a Lighthouse CI workflow (web apps)                       ${c.dim('[node · github]')}
  --ghazdo       also add the GitHub Advanced Security for Azure DevOps pipeline    ${c.dim('[azure]')}
  --artifacts <feed>  use an Azure Artifacts feed (nuget.config / .npmrc / uv index + pipeline auth) ${c.dim('[azure]')}
  --wiki         also scaffold docs/wiki as an Azure code wiki (.order, ADRs, runbooks)   ${c.dim('[azure]')}
  --skills       also add Claude Code skills (e.g. design-craft for UI/UX)
  --force        overwrite existing config/template files (pyproject.toml is only appended to)
  --no-install   skip installing dependencies / tools
  -h, --help     show this help

${c.bold('Other commands:')}
  govern         create & configure GitHub repos/orgs to industry standards — see devkit govern --help
  govern azure   Azure Repos branch policies (reviewers, work items, squash-only, build validation)
`;

export function printHelp() {
  console.log(HELP);
}

export async function runInit(argv) {
  if (argv.includes('-h') || argv.includes('--help')) return printHelp();

  const ctx = buildContext(argv);
  const { lang, host, isNext, isPrivate } = ctx;

  const preset = lang === 'node' ? `${isNext ? 'Next.js' : 'Node'} preset` : LANG_LABEL[lang];
  console.log(
    `\n${c.bold('devkit init')} ${c.dim(`(${preset}, ${HOST_LABEL[host]}, ${isPrivate ? 'private' : 'public'} repo)`)}\n`
  );

  // ── 1. Language config + 1b. app starter ────────────────────────────────
  if (lang === 'node') {
    configureNode(ctx);
    scaffoldNodeStarters(ctx);
  } else if (lang === 'python') {
    configurePython(ctx);
    scaffoldPythonStarter(ctx);
  } else {
    configureDotnet(ctx);
    scaffoldDotnetStarter(ctx);
  }

  // ── 2. Editor & hooks ───────────────────────────────────────────────────
  console.log(c.bold('\nEditor & hooks'));
  if (lang === 'node') scaffoldNodeHooks(ctx);
  scaffoldEditor(ctx);
  if (lang === 'node') scaffoldNodeVersionFiles(ctx);
  scaffoldLintConfigs(ctx);
  if (host === 'azure') {
    scaffoldAzureHooks(ctx); // AB#<id> commit link (Husky / pre-commit / core.hooksPath)
    scaffoldAzureArtifacts(ctx); // --artifacts: nuget.config / .npmrc / uv index
  }

  // ── 2b. CI + governance for the host ────────────────────────────────────
  if (host === 'github') {
    scaffoldGithubCi(ctx);
    scaffoldGithubGovernance(ctx);
  } else {
    scaffoldAzureCi(ctx);
    scaffoldAzureGovernance(ctx);
  }
  scaffoldReadme(ctx); // only if absent (never clobbers)
  if (host === 'azure') scaffoldAzureWiki(ctx); // --wiki: docs/wiki code-wiki skeleton
  scaffoldSkills(ctx);

  // ── 2c. Scratch workspace ───────────────────────────────────────────────
  scaffoldScratch(ctx);

  // ── 3–5. Manifest merge, dependency install, hook installation ──────────
  let steps;
  if (lang === 'node') {
    mergePackageJson(ctx);
    installNode(ctx);
    steps = nodeNextSteps(ctx);
  } else if (lang === 'python') {
    installPython(ctx);
    steps = pythonNextSteps(ctx);
  } else {
    installDotnet(ctx);
    steps = dotnetNextSteps(ctx);
  }

  // ── Done ────────────────────────────────────────────────────────────────
  const hostSteps = host === 'github' ? githubNextSteps(ctx) : azureNextSteps(ctx);
  console.log(`\n${c.green('✓ devkit wired up.')}\n`);
  console.log(`${c.bold('Next steps:')}`);
  const lines = [
    hostSteps.placeholders,
    ...steps.verify,
    hostSteps.platform,
    `Commit with a Conventional Commit ${c.dim('e.g. git commit -m "chore: adopt devkit"')}`,
    ...steps.run,
  ];
  let n = 0;
  for (const line of lines) {
    // Continuation lines (indented hints) are printed without a number.
    if (line.startsWith('   ')) console.log(`  ${line}`);
    else console.log(`  ${++n}. ${line}`);
  }
  console.log('');
}

export { log };
