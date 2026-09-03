// `devkit govern azure` — Azure Repos governance: branch + repository policies
// (reviewers, work-item linking, comment resolution, squash-only merges, build
// validation, path-scoped required reviewers, status checks, case/reserved-name/
// path-length/file-size/author-email hygiene), repo creation, code wikis, a
// shared pipeline-templates scaffold and a doctor.
//
// Subcommands:
//   doctor                          verify org URL, token and project access
//   repos                           list repositories in the project
//   create <name>                   create a repo (+ apply the policies)
//   apply                           converge policies on repo(s) (--repo | --all | --match)
//     --codeowners [path]           also derive required reviewers from a CODEOWNERS file
//   wiki list | publish             list wikis / publish docs/wiki as a code wiki
//   scaffold-pipeline-templates [dir]   write the shared `extends` pipeline templates repo
//
// Flags: --org-url <url> --project <name> --repo <r> --all --match <glob,glob>
//        --config <path> --dry-run --token <t> --prune --default-branch <b>
//        --name <wiki> --path </docs/wiki> --branch <b> --force
//
// Config: the `azure:` block of governance.config.yml (see lib/govern/azure/defaults.js).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { c, log, GovernError, describeApiError, matchesAny } from '../util.js';
import { loadConfig, deepMerge } from '../config.js';
import azureDefaults from './defaults.js';
import {
  makeAzureClient,
  resolveOrgUrl,
  resolveToken,
  getProject,
  listProjects,
  listRepos,
} from './client.js';
import { applyBranchPolicies, loadPolicyTypes, POLICY_TYPE_NAMES } from './policies.js';
import { codeownersToRequiredReviewers } from './codeowners.js';
import { listWikis, publishCodeWiki } from './wiki.js';
import { scaffoldPipelineTemplates } from './scaffold.js';

export const HELP = `
${c.bold('devkit govern azure')} — Azure Repos policies, wikis & repo setup

${c.bold('Usage:')}  devkit govern azure <command> [options]

${c.bold('Commands:')}
  ${c.cyan('doctor')}                        verify org URL, token and project access
  ${c.cyan('repos')}                         list repositories in the project
  ${c.cyan('create <name>')}                 create a repo and apply the policies
  ${c.cyan('apply')}                         converge branch + repository policies on repo(s)
  ${c.cyan('wiki list')}                     list the project's wikis
  ${c.cyan('wiki publish')}                  publish a repo folder (default /docs/wiki) as a code wiki
  ${c.cyan('scaffold-pipeline-templates')}   write a shared pipeline-templates repo (extends templates; no token needed)

${c.bold('Selectors (apply):')}
  --repo <r>               one repo
  --all                    every enabled repo in the project
  --match <glob,glob>      repos whose name matches any glob (e.g. "api-*,svc-*")

${c.bold('Options:')}
  --org-url <url>          https://dev.azure.com/<org> (else azure.organization / AZURE_DEVOPS_ORG_URL)
  --project <name>         Azure DevOps project (else azure.project / AZURE_DEVOPS_PROJECT)
  --config <path>          path to governance.config.{yml,json,js}
  --default-branch <b>     branch to protect (default: azure.defaultBranch → repo default → main)
  --codeowners [path]      (apply) add required-reviewer policies from a CODEOWNERS file
  --codeowners-skip-catch-all   ignore the "*" rule when translating CODEOWNERS
  --prune                  delete managed-type policies that are not in the config
  --name <wiki> --path </docs/wiki> --branch <b>   (wiki publish)
  --token <t>              PAT or bearer token (else AZURE_DEVOPS_EXT_PAT / SYSTEM_ACCESSTOKEN)
  --dry-run                print planned changes, make no API calls that mutate
  --force                  (scaffold-pipeline-templates) overwrite existing files
  -h, --help               show this help

${c.bold('Policies applied (defaults):')}
  branch:      1 approving review · stale votes reset on push · last pusher cannot approve ·
               all comments resolved · linked work item · squash-only merge ·
               build validation / required reviewers / status checks when configured
  repository:  case enforcement · reserved names · max path length 248 · max file size 100 MB ·
               author e-mail / blocked file patterns when configured

${c.bold('Examples:')}
  devkit govern azure doctor --org-url https://dev.azure.com/contoso --project Platform
  devkit govern azure apply --repo payments-api --dry-run
  devkit govern azure apply --all --prune
  devkit govern azure apply --repo payments-api --codeowners .github/CODEOWNERS
  devkit govern azure create payments-api
  devkit govern azure wiki publish --repo payments-api --path /docs/wiki
  devkit govern azure scaffold-pipeline-templates ./pipeline-templates --project Platform
`;

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else positional.push(a);
  }
  return { positional, flags };
}

// Resolve the effective azure config: defaults ← config file `azure:` ← flags/env.
export function resolveAzureConfig(fileConfig, flags, env = process.env) {
  const azure = deepMerge(azureDefaults, fileConfig?.azure ?? {});
  if (typeof flags['org-url'] === 'string') azure.organization = flags['org-url'];
  if (typeof flags.project === 'string') azure.project = flags.project;
  if (typeof flags['default-branch'] === 'string') azure.defaultBranch = flags['default-branch'];
  azure.project ??= env.AZURE_DEVOPS_PROJECT || env.AZDO_PROJECT || env.SYSTEM_TEAMPROJECT;
  return azure;
}

const CODEOWNERS_CANDIDATES = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];

// --codeowners [path]: merge CODEOWNERS-derived required reviewers into the config.
export function applyCodeownersFlag(
  azure,
  flags,
  { cwd = process.cwd(), readFile = readFileSync } = {}
) {
  if (!flags.codeowners) return azure;
  let file = typeof flags.codeowners === 'string' ? resolve(cwd, flags.codeowners) : null;
  if (!file) file = CODEOWNERS_CANDIDATES.map((f) => resolve(cwd, f)).find((f) => existsSync(f));
  if (!file || !existsSync(file)) {
    throw new GovernError(
      `CODEOWNERS not found${typeof flags.codeowners === 'string' ? `: ${flags.codeowners}` : ` (looked for ${CODEOWNERS_CANDIDATES.join(', ')})`}.`
    );
  }
  const derived = codeownersToRequiredReviewers(readFile(file, 'utf8'), {
    skipCatchAll: Boolean(flags['codeowners-skip-catch-all']),
  });
  log.info(
    `CODEOWNERS ${file}: ${derived.length} required-reviewer polic${derived.length === 1 ? 'y' : 'ies'}`
  );
  return {
    ...azure,
    policies: {
      ...azure.policies,
      requiredReviewers: [...(azure.policies?.requiredReviewers ?? []), ...derived],
    },
  };
}

async function selectRepos(client, project, flags) {
  if (typeof flags.repo === 'string') return [flags.repo];
  const names = (await listRepos(client, project)).map((r) => r.name);
  if (typeof flags.match === 'string') {
    const globs = flags.match.split(',').map((s) => s.trim());
    return names.filter((n) => matchesAny(n, globs));
  }
  if (flags.all) return names;
  throw new GovernError('No repos selected. Use --repo <name>, --all, or --match <glob,glob>.');
}

async function cmdDoctor(ctx, azure) {
  const { client } = ctx;
  log.head('govern azure doctor');
  log.info(`org: ${client.orgUrl}`);
  try {
    const conn = await client.get('_apis/connectionData');
    const who = conn?.authenticatedUser?.providerDisplayName || conn?.authenticatedUser?.id;
    log.add(`authenticated as ${who}`);
  } catch (err) {
    log.warn(describeApiError(err, 'authentication'));
    return;
  }
  try {
    const projects = await listProjects(client);
    log.same(
      `${projects.length} project(s) visible${
        projects.length
          ? ': ' +
            projects
              .slice(0, 8)
              .map((x) => x.name)
              .join(', ')
          : ''
      }`
    );
  } catch (err) {
    log.warn(describeApiError(err, 'list projects'));
  }
  if (!azure.project) {
    log.warn(
      'no project configured — pass --project or set azure.project (needed for repos/policies)'
    );
    return;
  }
  try {
    await getProject(client, azure.project);
    const types = await loadPolicyTypes(client, azure.project);
    const missing = Object.values(POLICY_TYPE_NAMES).filter((n) => !types.has(n));
    log.same(
      `project ${azure.project}: ${types.size} policy types${missing.length ? c.yellow(` (missing: ${missing.join(', ')})`) : ''}`
    );
    const repos = await listRepos(client, azure.project);
    log.same(`${repos.length} repo(s) in ${azure.project}`);
    const wikis = await listWikis(client, azure.project);
    log.same(
      `${wikis.length} wiki(s): ${wikis.map((w) => `${w.name} [${w.type}]`).join(', ') || 'none'}`
    );
  } catch (err) {
    log.warn(describeApiError(err, `project ${azure.project}`));
  }
}

async function cmdRepos(ctx, azure) {
  const repos = await listRepos(ctx.client, requireProject(azure));
  log.head(`Repositories in ${azure.project}`);
  for (const r of repos) {
    log.info(`${r.name}  ${c.dim(r.defaultBranch ?? '(empty)')}  ${c.dim(r.webUrl ?? '')}`);
  }
}

async function cmdCreate(ctx, azure, positional, flags) {
  const name = positional[0];
  if (!name) throw new GovernError('Usage: devkit govern azure create <name>');
  const project = requireProject(azure);
  const { client, dryRun } = ctx;
  log.head(`Create ${project}/${name}`);
  const proj = await getProject(client, project);
  if (dryRun) {
    log.plan(`create repository ${name} in ${project}`);
    log.plan(`apply policies to ${name}@${azure.defaultBranch}`);
    return;
  }
  const repo = await client.post(`${encodeURIComponent(project)}/_apis/git/repositories`, {
    name,
    project: { id: proj.id },
  });
  log.add(`repository ${repo.name} → ${repo.webUrl}`);
  log.info(
    'the repo is empty: push an initial commit on the default branch, then the policies below take effect'
  );
  await applyBranchPolicies(ctx, { project, repo: name, azure, prune: Boolean(flags.prune) });
}

async function cmdApply(ctx, azure, flags) {
  const project = requireProject(azure);
  const repos = await selectRepos(ctx.client, project, flags);
  log.info(`Applying policies to ${repos.length} repo(s)${ctx.dryRun ? ' (dry-run)' : ''}`);
  const ok = [];
  const failed = [];
  for (const repo of repos) {
    log.head(repo);
    try {
      await applyBranchPolicies(ctx, { project, repo, azure, prune: Boolean(flags.prune) });
      ok.push(repo);
    } catch (err) {
      if (err?.userFacing) throw err;
      failed.push(repo);
      log.warn(describeApiError(err, repo));
    }
  }
  log.head('Summary');
  log.info(
    `${ok.length} repo(s) ok` + (failed.length ? `, ${c.red(`${failed.length} failed`)}` : '')
  );
}

async function cmdWiki(ctx, azure, positional, flags) {
  const project = requireProject(azure);
  const sub = positional[0];
  if (sub === 'list' || !sub) {
    const wikis = await listWikis(ctx.client, project);
    log.head(`Wikis in ${project}`);
    if (!wikis.length) log.info('none');
    for (const w of wikis) {
      log.info(
        `${w.name}  ${c.dim(w.type)}${w.mappedPath ? c.dim(`  ${w.mappedPath}`) : ''}  ${c.dim(w.remoteUrl ?? w.url ?? '')}`
      );
    }
    return;
  }
  if (sub === 'publish') {
    log.head(`Publish code wiki`);
    return publishCodeWiki(ctx, {
      project,
      repo: typeof flags.repo === 'string' ? flags.repo : undefined,
      name: typeof flags.name === 'string' ? flags.name : undefined,
      path: typeof flags.path === 'string' ? flags.path : '/docs/wiki',
      branch:
        typeof flags.branch === 'string'
          ? flags.branch
          : typeof flags['default-branch'] === 'string'
            ? flags['default-branch']
            : undefined,
    });
  }
  throw new GovernError(
    'Usage: devkit govern azure wiki <list|publish> [--repo <r>] [--name <n>] [--path </docs/wiki>] [--branch <b>]'
  );
}

function requireProject(azure) {
  if (!azure.project) {
    throw new GovernError(
      'No Azure DevOps project configured. Pass --project <name> or set azure.project in governance.config.yml.'
    );
  }
  return azure.project;
}

export async function runAzureGovern(argv) {
  const { positional, flags } = parseArgs(argv);
  const command = positional.shift();
  if (!command || command === 'help' || flags.help || flags.h) {
    console.log(HELP);
    return;
  }

  // Needs no token or org.
  if (command === 'scaffold-pipeline-templates') {
    scaffoldPipelineTemplates({
      targetDir: positional[0] ? resolve(process.cwd(), positional[0]) : process.cwd(),
      force: Boolean(flags.force),
      project: typeof flags.project === 'string' ? flags.project : undefined,
    });
    return;
  }

  const { config, source } = await loadConfig({
    explicitPath: typeof flags.config === 'string' ? flags.config : undefined,
    requireOrg: false,
  });
  let azure = resolveAzureConfig(config, flags);
  azure = applyCodeownersFlag(azure, flags);
  const orgUrl = resolveOrgUrl(azure.organization, { trustedHosts: azure.trustedHosts });
  const token = resolveToken(typeof flags.token === 'string' ? flags.token : undefined);
  const client = makeAzureClient({ orgUrl, token });
  const ctx = { client, dryRun: Boolean(flags['dry-run']) };
  log.info(
    `azure ${c.bold(orgUrl)}${azure.project ? ` · project ${c.bold(azure.project)}` : ''} · config ${c.dim(source)}${ctx.dryRun ? c.yellow(' · dry-run') : ''}`
  );

  switch (command) {
    case 'doctor':
      return cmdDoctor(ctx, azure);
    case 'repos':
      return cmdRepos(ctx, azure);
    case 'create':
      return cmdCreate(ctx, azure, positional, flags);
    case 'apply':
    case 'policies':
      return cmdApply(ctx, azure, flags);
    case 'wiki':
      return cmdWiki(ctx, azure, positional, flags);
    default:
      throw new GovernError(`Unknown command "${command}". Run: devkit govern azure --help`);
  }
}
