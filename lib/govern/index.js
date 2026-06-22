// `devkit govern` — entry point and subcommand dispatcher.
//
// Subcommands:
//   create <name>            create a new repo and configure it end-to-end
//   apply                    apply config to existing repo(s) (--repo/--all/--match)
//   org                      apply org-level settings, rulesets, webhooks, secrets, security rollout
//   labels | rulesets | security | webhooks | secrets    targeted per-repo ops
//   projects <add|status>    Projects v2 automation
//   bulk-codeql              bulk-enable CodeQL default setup across the org
//   scaffold-safe-settings   write declarative safe-settings config templates
//   doctor                   verify deps, token, and scopes
//
// Global flags: --org <o> --config <path> --dry-run --token <t> --yes
//   --repo <r> --all --match <glob,glob> --public --private --template <o/r>
//   --prune --with-secrets --allow-paid

import { c, log, GovernError, makeCtx, describeApiError } from './util.js';
import { loadConfig } from './config.js';
import { makeOctokit } from './octokit.js';
import { createRepo, applyRepoSettings, applyTopics, applyAutolinks } from './repo.js';
import { applyBranchProtection } from './branch.js';
import { applyRepoRuleset, applyOrgRuleset } from './rulesets.js';
import { applyTeams, applyCollaborators, ensureTeams } from './access.js';
import { syncLabels } from './labels.js';
import { applySecrets, applyVariables } from './secrets.js';
import { applyWebhooks } from './webhooks.js';
import { applyRepoSecurity, rolloutOrgConfiguration, bulkEnableCodeScanning } from './security.js';
import { applyOrgSettings } from './org.js';
import { addToBoard, setBoardStatus } from './projects.js';
import { resolveTargets, forEachRepo } from './bulk.js';
import { scaffoldSafeSettings } from './safe-settings.js';

// ── tiny argv parser ────────────────────────────────────────────────────────
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

function selectorFrom(flags) {
  return {
    repo: typeof flags.repo === 'string' ? flags.repo : undefined,
    all: Boolean(flags.all),
    match: typeof flags.match === 'string' ? flags.match.split(',').map((s) => s.trim()) : undefined,
    includeArchived: Boolean(flags['include-archived']),
  };
}

const HELP = `
${c.bold('devkit govern')} — create & configure GitHub repos/orgs to industry standards

${c.bold('Usage:')}  devkit govern <command> [options]

${c.bold('Commands:')}
  ${c.cyan('create <name>')}            create a new repo and fully configure it
  ${c.cyan('apply')}                    apply config to existing repo(s)
  ${c.cyan('org')}                      apply org settings, rulesets, webhooks, secrets, security rollout
  ${c.cyan('labels')}                   sync labels onto repo(s)
  ${c.cyan('rulesets')}                 apply branch ruleset(s) onto repo(s)
  ${c.cyan('security')}                 enable code/secret scanning, Dependabot on repo(s)
  ${c.cyan('webhooks')}                 sync webhooks onto repo(s)
  ${c.cyan('secrets')}                  set Actions/Dependabot secrets + variables (values from env)
  ${c.cyan('projects <add|status>')}    Projects v2 automation (needs a PAT/App token, not GITHUB_TOKEN)
  ${c.cyan('bulk-codeql')}             bulk-enable CodeQL default setup across the org
  ${c.cyan('scaffold-safe-settings')}  write declarative safe-settings config templates
  ${c.cyan('doctor')}                   verify dependencies, token, and scopes

${c.bold('Selectors (apply/labels/rulesets/security/webhooks/secrets):')}
  --repo <r>               one repo
  --all                    every non-archived repo in the org
  --match <glob,glob>      repos whose name matches any glob (e.g. "api-*,svc-*")

${c.bold('Global options:')}
  --org <o>                GitHub org (default: from config, else vpnsin-labs)
  --config <path>          path to governance.config.{yml,json,js}
  --dry-run                print planned changes, make no API calls that mutate
  --token <t>              GitHub token (else GITHUB_TOKEN / GH_TOKEN / App env)
  --public | --private     repo visibility for create
  --template <owner/repo>  create from a template repo
  --prune                  (labels) delete labels not in the desired set
  --with-secrets           (apply/create) also set secrets (needs env values)
  --allow-paid             permit licence-gated scans on private/internal repos
  --yes                    skip confirmation prompts
  -h, --help               show this help

${c.bold('Examples:')}
  devkit govern create my-service --template vpnsin-labs/node-template
  devkit govern apply --all --dry-run
  devkit govern security --match "api-*" --allow-paid
  devkit govern org
  devkit govern projects status --project 5 --repo my-service --number 42 --status Done
  devkit govern scaffold-safe-settings ./admin --org vpnsin-labs
`;

// ── full per-repo configuration ─────────────────────────────────────────────
async function applyToRepo(ctx, config, repo, flags) {
  await applyRepoSettings(ctx, repo, config.repository, { defaultBranch: config.defaultBranch });
  if (config.topics) await applyTopics(ctx, repo, config.topics);
  if (config.autolinks?.length) await applyAutolinks(ctx, repo, config.autolinks);

  const mode = config.protectionMode || 'ruleset';
  if ((mode === 'ruleset' || mode === 'both') && config.ruleset)
    await applyRepoRuleset(ctx, repo, config.ruleset);
  if ((mode === 'branch-protection' || mode === 'both') && config.branchProtection)
    await applyBranchProtection(ctx, repo, config.branchProtection);

  if (config.labels?.length) await syncLabels(ctx, repo, config.labels, { prune: Boolean(flags.prune) });
  if (config.teams?.length) await applyTeams(ctx, repo, config.teams);
  if (config.collaborators?.length) await applyCollaborators(ctx, repo, config.collaborators);
  if (config.security) await applyRepoSecurity(ctx, repo, config.security, { allowPaid: Boolean(flags['allow-paid']) });
  if (config.webhooks?.length) await applyWebhooks(ctx, config.webhooks, { scope: 'repo', repo });

  if (flags['with-secrets']) {
    if (config.secrets) await applySecrets(ctx, config.secrets, { scope: 'repo', repo });
    if (config.variables?.length) await applyVariables(ctx, config.variables, { scope: 'repo', repo });
  } else if (config.secrets || config.variables?.length) {
    log.skip('secrets/variables (pass --with-secrets to apply; values come from env)');
  }
}

function reportSummary({ ok, failed }) {
  log.head('Summary');
  log.info(`${ok.length} repo(s) ok` + (failed.length ? `, ${c.red(`${failed.length} failed`)}` : ''));
  for (const f of failed) log.warn(`${f.repo}: ${f.error}`);
}

// ── command handlers ────────────────────────────────────────────────────────
async function cmdCreate(ctx, config, positional, flags) {
  const name = positional[0];
  if (!name) throw new GovernError('Usage: devkit govern create <name>');
  const createDefaults = { ...config.repositoryCreate };
  if (flags.public) createDefaults.private = false;
  if (flags.private) createDefaults.private = true;

  log.head(`Create ${ctx.org}/${name}`);
  const repo = await createRepo(ctx, name, {
    template: typeof flags.template === 'string' ? flags.template : config.template,
    createDefaults,
    description: typeof flags.description === 'string' ? flags.description : config.description,
    topics: config.topics,
  });
  await applyToRepo(ctx, config, repo.name || name, flags);
  log.head('Done');
  log.info(`https://github.com/${ctx.org}/${name}`);
}

async function cmdApply(ctx, config, flags) {
  const targets = await resolveTargets(ctx, selectorFrom(flags));
  if (!targets.length) throw new GovernError('No repos selected. Use --repo, --all, or --match.');
  log.info(`Applying to ${targets.length} repo(s)${ctx.dryRun ? ' (dry-run)' : ''}`);
  const result = await forEachRepo(ctx, targets, (repo) => applyToRepo(ctx, config, repo, flags));
  reportSummary(result);
}

async function cmdPerRepo(ctx, config, flags, action) {
  const targets = await resolveTargets(ctx, selectorFrom(flags));
  if (!targets.length) throw new GovernError('No repos selected. Use --repo, --all, or --match.');
  const result = await forEachRepo(ctx, targets, (repo) => action(repo));
  reportSummary(result);
}

async function cmdOrg(ctx, config, flags) {
  log.head(`Org ${ctx.org}`);
  if (config.organization) await applyOrgSettings(ctx, config.organization);
  for (const rs of config.orgRulesets || []) await applyOrgRuleset(ctx, rs);
  if (config.teams?.length) await ensureTeams(ctx, config.teams);
  if (config.orgWebhooks?.length) await applyWebhooks(ctx, config.orgWebhooks, { scope: 'org' });
  if (flags['with-secrets']) {
    if (config.orgSecrets) await applySecrets(ctx, config.orgSecrets, { scope: 'org' });
    if (config.orgVariables) await applyVariables(ctx, config.orgVariables, { scope: 'org' });
  }
  if (config.securityConfiguration) {
    await rolloutOrgConfiguration(ctx, config.securityConfiguration, config.securityConfigurationRollout);
  }
}

async function cmdProjects(ctx, config, positional, flags) {
  const sub = positional[0];
  const project = flags.project ?? config.projects?.number;
  if (!project) throw new GovernError('Specify --project <number> (or projects.number in config).');
  const target = {
    owner: ctx.org,
    repo: flags.repo,
    number: flags.number,
  };
  if (!target.repo || !target.number)
    throw new GovernError('Specify --repo <name> and --number <issue/PR number>.');

  if (sub === 'add') await addToBoard(ctx, project, target, { status: flags.status });
  else if (sub === 'status') {
    if (!flags.status) throw new GovernError('Specify --status <option name>.');
    await setBoardStatus(ctx, project, target, flags.status);
  } else throw new GovernError('Usage: devkit govern projects <add|status> ...');
}

async function cmdDoctor(ctx) {
  log.head('govern doctor');
  log.same('dependencies loaded (@octokit/rest, plugins, libsodium, yaml)');
  try {
    const { data: user } = await ctx.octokit.rest.users.getAuthenticated();
    log.add(`authenticated as ${user.login}`);
  } catch (err) {
    log.warn(describeApiError(err, 'authentication'));
  }
  try {
    const res = await ctx.octokit.request('GET /rate_limit');
    // Don't echo the raw x-oauth-scopes header (treated as sensitive). Instead
    // report only whether each scope govern needs is PRESENT — a derived boolean,
    // not the header value itself.
    const header = res.headers['x-oauth-scopes'];
    if (header == null) {
      log.info('token type: fine-grained PAT or GitHub App (classic scopes not listed)');
    } else {
      const have = new Set(
        header
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      const needed = [
        ['repo', 'repo settings, branch protection, secrets, labels, webhooks'],
        ['admin:org', 'org settings, org rulesets, org secrets, team creation'],
        ['project', 'Projects v2 automation'],
      ];
      log.info('classic PAT scopes:');
      for (const [scope, why] of needed) {
        const present = have.has(scope);
        const line = `${present ? '✓' : '✗'} ${scope} — ${why}`;
        if (present) log.same(line);
        else log.warn(line);
      }
    }
    log.info(`org: ${ctx.org}`);
    log.info('Projects v2 needs a PAT/App token with org Projects access (GITHUB_TOKEN will NOT work).');
  } catch (err) {
    log.warn(describeApiError(err, 'rate limit check'));
  }
}

// ── dispatch ────────────────────────────────────────────────────────────────
export async function runGovern(argv) {
  const { positional, flags } = parseArgs(argv);
  const command = positional.shift();

  if (!command || command === 'help' || flags.help || flags.h) {
    console.log(HELP);
    return;
  }

  // scaffold-safe-settings needs no token.
  if (command === 'scaffold-safe-settings') {
    scaffoldSafeSettings({
      targetDir: positional[0] || process.cwd(),
      force: Boolean(flags.force),
      org: typeof flags.org === 'string' ? flags.org : undefined,
    });
    return;
  }

  const { config, source } = await loadConfig({
    explicitPath: typeof flags.config === 'string' ? flags.config : undefined,
    cliOrg: typeof flags.org === 'string' ? flags.org : undefined,
  });
  log.info(`org ${c.bold(config.org)} · config ${c.dim(source)}${flags['dry-run'] ? c.yellow(' · dry-run') : ''}`);

  const octokit = await makeOctokit({ token: typeof flags.token === 'string' ? flags.token : undefined });
  const ctx = makeCtx({ octokit, org: config.org, dryRun: Boolean(flags['dry-run']) });
  ctx.defaultBranch = config.defaultBranch;

  switch (command) {
    case 'create':
      return cmdCreate(ctx, config, positional, flags);
    case 'apply':
      return cmdApply(ctx, config, flags);
    case 'org':
      return cmdOrg(ctx, config, flags);
    case 'labels':
      return cmdPerRepo(ctx, config, flags, (repo) =>
        syncLabels(ctx, repo, config.labels, { prune: Boolean(flags.prune) })
      );
    case 'rulesets':
      return cmdPerRepo(ctx, config, flags, (repo) => applyRepoRuleset(ctx, repo, config.ruleset));
    case 'security':
      return cmdPerRepo(ctx, config, flags, (repo) =>
        applyRepoSecurity(ctx, repo, config.security, { allowPaid: Boolean(flags['allow-paid']) })
      );
    case 'webhooks':
      return cmdPerRepo(ctx, config, flags, (repo) =>
        applyWebhooks(ctx, config.webhooks || [], { scope: 'repo', repo })
      );
    case 'secrets':
      return cmdPerRepo(ctx, config, flags, async (repo) => {
        await applySecrets(ctx, config.secrets || {}, { scope: 'repo', repo });
        await applyVariables(ctx, config.variables || [], { scope: 'repo', repo });
      });
    case 'projects':
      return cmdProjects(ctx, config, positional, flags);
    case 'bulk-codeql':
      log.head('Bulk CodeQL default setup');
      return bulkEnableCodeScanning(ctx, {
        allowPaid: Boolean(flags['allow-paid']),
        querySuite: config.security?.codeScanningQuerySuite || 'default',
      });
    case 'doctor':
      return cmdDoctor(ctx);
    default:
      throw new GovernError(`Unknown command "${command}". Run: devkit govern --help`);
  }
}
