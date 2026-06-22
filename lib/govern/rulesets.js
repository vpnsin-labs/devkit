// Repository and organization rulesets — the modern, recommended replacement
// for classic branch protection. Idempotent by ruleset `name`: existing rulesets
// with the same name are UPDATED, not duplicated.
//
// Ruleset rule vocabulary differs from branch protection — e.g.
// require_code_owner_review (singular), strict_required_status_checks_policy,
// and integration_id (not app_id). Keep them distinct.

import { log, tolerate } from './util.js';

// Apply a repo ruleset. `spec` = { name, target, enforcement, bypass_actors,
// conditions, rules }.
export async function applyRepoRuleset(ctx, repo, spec) {
  const { octokit, org, dryRun } = ctx;
  const existing = await octokit.paginate(octokit.rest.repos.getRepoRulesets, {
    owner: org,
    repo,
    per_page: 100,
  });
  const match = existing.find((r) => r.name === spec.name);
  const body = { owner: org, repo, ...spec };

  if (match) {
    if (dryRun) return log.plan(`update ruleset "${spec.name}" on ${repo}`);
    await octokit.rest.repos.updateRepoRuleset({ ...body, ruleset_id: match.id });
    return log.edit(`ruleset "${spec.name}" on ${repo}`);
  }
  if (dryRun) return log.plan(`create ruleset "${spec.name}" on ${repo}`);
  // tolerate a name-collision race (find→create window): if it now exists, the
  // desired ruleset is already present.
  await tolerate([409, 422], () => octokit.rest.repos.createRepoRuleset(body));
  log.add(`ruleset "${spec.name}" on ${repo}`);
}

// Apply an ORG ruleset. Org rulesets add a `conditions.repository_name` /
// `repository_id` / `repository_property` selector and support enforcement:
// 'evaluate' (audit mode).
export async function applyOrgRuleset(ctx, spec) {
  const { octokit, org, dryRun } = ctx;
  // NOTE: Octokit exposes the ORG ruleset endpoints under the `repos` namespace
  // (getOrgRulesets / createOrgRuleset / updateOrgRuleset), not `orgs`.
  const existing = await octokit.paginate(octokit.rest.repos.getOrgRulesets, { org, per_page: 100 });
  const match = existing.find((r) => r.name === spec.name);
  const body = { org, ...spec };

  if (match) {
    if (dryRun) return log.plan(`update org ruleset "${spec.name}"`);
    await octokit.rest.repos.updateOrgRuleset({ ...body, ruleset_id: match.id });
    return log.edit(`org ruleset "${spec.name}"`);
  }
  if (dryRun) return log.plan(`create org ruleset "${spec.name}"`);
  await tolerate([409, 422], () => octokit.rest.repos.createOrgRuleset(body));
  log.add(`org ruleset "${spec.name}"`);
}
