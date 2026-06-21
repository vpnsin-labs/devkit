// Legacy branch protection (PUT .../branches/{branch}/protection).
//
// Gotchas encoded here:
//  - Every nullable sub-block (required_status_checks, required_pull_request_
//    reviews, restrictions) must be PRESENT in the payload; `restrictions` must
//    be an explicit `null` to mean "no push restrictions" or the API 422s.
//  - `enforce_admins` is SENT as a boolean (the GET response returns it as an
//    object — never round-trip a GET into a PUT).
//  - Signed-commit enforcement is a SEPARATE endpoint, not a body field.
//
// Prefer rulesets (rulesets.js) for new repos; this exists for orgs standardised
// on classic branch protection.

import { log } from './util.js';

export async function applyBranchProtection(ctx, repo, protection, { branch } = {}) {
  const { octokit, org, dryRun } = ctx;
  const targetBranch = branch || (await resolveDefaultBranch(octokit, org, repo, dryRun));
  if (!targetBranch) return;

  const { required_signatures, ...rest } = protection;

  // Build a payload where every nullable block is explicitly present.
  const payload = {
    owner: org,
    repo,
    branch: targetBranch,
    required_status_checks: rest.required_status_checks ?? null,
    enforce_admins: Boolean(rest.enforce_admins),
    required_pull_request_reviews: rest.required_pull_request_reviews ?? null,
    restrictions: rest.restrictions ?? null, // MUST be null, never omitted
    required_linear_history: rest.required_linear_history,
    allow_force_pushes: rest.allow_force_pushes,
    allow_deletions: rest.allow_deletions,
    required_conversation_resolution: rest.required_conversation_resolution,
    block_creations: rest.block_creations,
    lock_branch: rest.lock_branch,
    allow_fork_syncing: rest.allow_fork_syncing,
  };

  if (dryRun) {
    log.plan(`branch protection on ${org}/${repo}@${targetBranch}`);
  } else {
    await octokit.rest.repos.updateBranchProtection(payload);
    log.edit(`branch protection on ${org}/${repo}@${targetBranch}`);
  }

  // Signed commits — separate endpoint.
  if (required_signatures === true) {
    if (dryRun) log.plan(`require signed commits on ${targetBranch}`);
    else {
      await octokit.rest.repos.createCommitSignatureProtection({ owner: org, repo, branch: targetBranch });
      log.edit(`require signed commits on ${targetBranch}`);
    }
  } else if (required_signatures === false) {
    // Best-effort disable; ignore 404 (not currently required).
    if (!dryRun) {
      await octokit.rest.repos
        .deleteCommitSignatureProtection({ owner: org, repo, branch: targetBranch })
        .catch(() => {});
    }
  }
}

async function resolveDefaultBranch(octokit, org, repo, dryRun) {
  try {
    const { data } = await octokit.rest.repos.get({ owner: org, repo });
    return data.default_branch;
  } catch (err) {
    if (dryRun) return 'main';
    throw err;
  }
}
