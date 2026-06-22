// Security rollout.
//
// Two paths:
//  1. Per-repo toggles (applyRepoSecurity) — CodeQL default setup, secret
//     scanning + push protection, dependency graph + Dependabot alerts,
//     Dependabot security updates, private vulnerability reporting.
//  2. Org code-security CONFIGURATION (rolloutOrgConfiguration) — create a
//     reusable config bundling every feature and attach it to many repos at
//     once. This is the recommended way to enforce security at fleet scale and
//     supersedes the sunset org security_and_analysis defaults.
//
// Licensing gate: code scanning + secret scanning are FREE on public repos but
// need a paid licence (GitHub Code Security / Secret Protection) on private/
// internal repos. Per-repo `advanced_security` is REJECTED on public repos. We
// detect visibility and skip the licence-gated bits unless the caller opts in.

import { log } from './util.js';
import { getRepo, listOrgRepos } from './octokit.js';

const isPublicRepo = (info) => info.visibility === 'public' || info.private === false;

// Resolve repo visibility. In dry-run we assume public (no API call); otherwise
// we MUST NOT guess on error — mistaking a private repo for public would skip
// licence-gated toggles and quietly weaken posture. Only 404 is tolerated.
async function resolveRepoInfo(octokit, org, repo, dryRun) {
  if (dryRun) return { visibility: 'public', private: false };
  try {
    return await getRepo(octokit, org, repo);
  } catch (err) {
    if ((err?.status ?? err?.response?.status) === 404) return null;
    throw err;
  }
}

// Dependency graph + Dependabot alerts/updates + private vuln reporting — free
// on every repo (public AND private).
async function applyFreeToggles(ctx, repo, sec) {
  const { octokit, org } = ctx;
  if (sec.vulnerabilityAlerts) {
    await run(ctx, `Dependabot alerts on ${repo}`, () =>
      octokit.rest.repos.enableVulnerabilityAlerts({ owner: org, repo })
    );
  }
  if (sec.automatedSecurityFixes) {
    await run(ctx, `Dependabot security updates on ${repo}`, () =>
      octokit.rest.repos.enableAutomatedSecurityFixes({ owner: org, repo })
    );
  }
  if (sec.privateVulnerabilityReporting) {
    await run(ctx, `private vulnerability reporting on ${repo}`, () =>
      octokit.rest.repos.enablePrivateVulnerabilityReporting({ owner: org, repo })
    );
  }
}

// Secret scanning + push protection — free on public; licence-gated otherwise.
async function applySecretScanning(ctx, repo, sec, { licenceGated, allowPaid }) {
  const { octokit, org } = ctx;
  if (!sec.secretScanning && !sec.secretScanningPushProtection) return;
  if (licenceGated && !allowPaid) {
    return log.skip(`secret scanning on ${repo} (private — needs GitHub Secret Protection; pass --allow-paid)`);
  }
  const security_and_analysis = {
    ...(sec.secretScanning ? { secret_scanning: { status: 'enabled' } } : {}),
    ...(sec.secretScanningPushProtection ? { secret_scanning_push_protection: { status: 'enabled' } } : {}),
    // advanced_security turns the above on for PRIVATE repos but is REJECTED on
    // public repos — only send it where licence-gated.
    ...(licenceGated ? { advanced_security: { status: 'enabled' } } : {}),
  };
  await run(ctx, `secret scanning on ${repo}`, () =>
    octokit.rest.repos.update({ owner: org, repo, security_and_analysis })
  );
}

// CodeQL default setup — free on public; licence-gated otherwise.
async function applyCodeScanning(ctx, repo, sec, { licenceGated, allowPaid }) {
  const { octokit, org } = ctx;
  if (!sec.codeScanningDefaultSetup) return;
  if (licenceGated && !allowPaid) {
    return log.skip(`CodeQL on ${repo} (private — needs GitHub Code Security; pass --allow-paid)`);
  }
  await run(ctx, `CodeQL default setup on ${repo}`, () =>
    octokit.rest.codeScanning.updateDefaultSetup({
      owner: org,
      repo,
      state: 'configured', // NOT 'enabled'
      query_suite: sec.codeScanningQuerySuite || 'default',
      // languages omitted → GitHub auto-detects from the repo
    })
  );
}

// Per-repo. `sec` is the merged `security` block. `opts.allowPaid` permits the
// licence-gated toggles on private/internal repos (default: skip with a note).
export async function applyRepoSecurity(ctx, repo, sec, { allowPaid = false } = {}) {
  const { octokit, org, dryRun } = ctx;
  const info = await resolveRepoInfo(octokit, org, repo, dryRun);
  if (!info) return log.warn(`${repo}: not found — skipping security`);

  const licenceGated = !isPublicRepo(info); // private/internal need a paid licence
  const gate = { licenceGated, allowPaid };

  await applyFreeToggles(ctx, repo, sec);
  await applySecretScanning(ctx, repo, sec, gate);
  await applyCodeScanning(ctx, repo, sec, gate);
}

// Org-level: create (or reuse) a code-security configuration and roll it out.
// `cfg` is the configuration body; `rollout` = { attachScope, defaultForNewRepos }.
export async function rolloutOrgConfiguration(ctx, cfg, rollout) {
  const { octokit, org, dryRun } = ctx;
  const scope = rollout?.attachScope || 'all_without_configurations';
  const def = rollout?.defaultForNewRepos;

  // Reuse an existing config with the same name (create is not idempotent).
  const existing = await octokit
    .paginate('GET /orgs/{org}/code-security/configurations', { org, per_page: 100 })
    .catch(() => []);
  const match = existing.find((c) => c.name === cfg.name);

  if (dryRun) {
    log.plan(`${match ? 'update' : 'create'} org code-security configuration "${cfg.name}"`);
    log.plan(`attach configuration to repos (scope: ${scope})`);
    if (def) log.plan(`set as default for new repos (${def})`);
    return match;
  }

  let configuration = match;
  if (configuration) {
    await octokit.request('PATCH /orgs/{org}/code-security/configurations/{configuration_id}', {
      org,
      configuration_id: configuration.id,
      ...cfg,
    });
    log.edit(`code-security configuration "${cfg.name}" (#${configuration.id})`);
  } else {
    const { data } = await octokit.request('POST /orgs/{org}/code-security/configurations', { org, ...cfg });
    configuration = data;
    log.add(`code-security configuration "${cfg.name}" (#${data.id})`);
  }

  await octokit.request('POST /orgs/{org}/code-security/configurations/{configuration_id}/attach', {
    org,
    configuration_id: configuration.id,
    scope,
  });
  log.edit(`attached to repos (scope: ${scope}, async)`);

  if (def) {
    await octokit.request('PUT /orgs/{org}/code-security/configurations/{configuration_id}/defaults', {
      org,
      configuration_id: configuration.id,
      default_for_new_repos: def,
    });
    log.edit(`default for new repos: ${def}`);
  }
  return configuration;
}

// Bulk-enable CodeQL default setup across every (non-archived) repo in the org.
// Honours the licensing gate per repo.
export async function bulkEnableCodeScanning(ctx, { allowPaid = false, querySuite = 'default' } = {}) {
  const { octokit, org } = ctx;
  const repos = await listOrgRepos(octokit, org);
  log.info(`${repos.length} repos`);
  for (const r of repos) {
    if (!isPublicRepo(r) && !allowPaid) {
      log.skip(`${r.name} (private — needs GitHub Code Security; pass --allow-paid)`);
      continue;
    }
    await run(ctx, `CodeQL on ${r.name}`, () =>
      octokit.rest.codeScanning.updateDefaultSetup({
        owner: org,
        repo: r.name,
        state: 'configured',
        query_suite: querySuite,
      })
    );
  }
}

// Run an enable op, tolerating "already enabled / not modified" responses.
async function run(ctx, label, fn) {
  if (ctx.dryRun) return log.plan(label);
  try {
    await fn();
    log.edit(label);
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    if (status === 304) return log.same(label); // already in desired state
    if (status === 422) return log.warn(`${label} — ${err.response?.data?.message || 'unprocessable'}`);
    throw err;
  }
}
