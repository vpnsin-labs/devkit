// Resolve the set of repos a command should act on, and run a per-repo action
// with isolated error handling (one repo failing doesn't abort the whole run).

import { log, matchesAny, describeApiError } from './util.js';
import { listOrgRepos } from './octokit.js';

// Resolve target repo names from CLI selectors:
//   { repo }            → single repo
//   { all: true }       → every non-archived repo in the org
//   { match: [globs] }  → repos whose name matches any glob
export async function resolveTargets(ctx, selector = {}) {
  const { octokit, org } = ctx;
  if (selector.repo) return [selector.repo];
  const repos = await listOrgRepos(octokit, org, { includeArchived: selector.includeArchived });
  const names = repos.map((r) => r.name);
  if (selector.match?.length) return names.filter((n) => matchesAny(n, selector.match));
  if (selector.all) return names;
  return [];
}

// Run `action(repo)` for each target, catching per-repo failures.
// Returns { ok: [...], failed: [{ repo, error }] }.
export async function forEachRepo(ctx, targets, action) {
  const ok = [];
  const failed = [];
  for (const repo of targets) {
    log.head(repo);
    try {
      await action(repo);
      ok.push(repo);
    } catch (err) {
      if (err?.userFacing) throw err; // config/credential errors are fatal — surface immediately
      failed.push({ repo, error: describeApiError(err, repo) });
      log.warn(describeApiError(err, repo));
    }
  }
  return { ok, failed };
}
