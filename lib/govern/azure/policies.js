// Converge Azure Repos policies (policy configurations) for a repository:
// branch policies scoped to the default branch plus repository-level hygiene
// policies. Idempotent: existing configurations of a managed type on the same
// scope are updated in place; missing ones are created; with --prune,
// managed-type configurations that are no longer desired are deleted.
//
// Policy type ids differ per organization, so they are looked up by display name
// from GET {project}/_apis/policy/types instead of being hard-coded.

import { log, GovernError } from '../util.js';
import { getRepo, resolveBuildDefinition, resolveIdentity } from './client.js';

// config key → Azure DevOps policy type display name
export const POLICY_TYPE_NAMES = {
  // branch-scoped
  minimumReviewers: 'Minimum number of reviewers',
  workItemLinking: 'Work item linking',
  commentResolution: 'Comment requirements',
  mergeStrategy: 'Require a merge strategy',
  buildValidation: 'Build',
  requiredReviewers: 'Required reviewers',
  statusChecks: 'Status',
  // repository-scoped
  caseEnforcement: 'Git repository settings',
  reservedNames: 'Reserved names restriction',
  maxPathLength: 'Path Length restriction',
  maxFileSize: 'File size restriction',
  authorEmail: 'Commit author email validation',
  blockedFiles: 'File name restriction',
};

const p = (project) => encodeURIComponent(project);

export async function loadPolicyTypes(client, project) {
  const data = await client.get(`${p(project)}/_apis/policy/types`);
  const byName = new Map();
  for (const t of data?.value ?? []) byName.set(t.displayName, t.id);
  return byName;
}

export function refNameFor(branch) {
  return branch.startsWith('refs/') ? branch : `refs/heads/${branch}`;
}

// Build the list of desired policy configurations from the merged azure config.
// `resolvers` turns pipeline names → definition ids and reviewer strings →
// identity ids (injected so this stays unit-testable without the network).
// `repositorySettings` (optional) adds the repository-scoped hygiene policies.
export async function desiredPolicies(
  policies,
  { repositoryId, refName, typeIds, resolvers, repositorySettings }
) {
  const branchScope = [{ repositoryId, refName, matchKind: 'Exact' }];
  const repoScope = [{ repositoryId }];
  const out = [];
  const typeId = (key) => {
    const id = typeIds.get(POLICY_TYPE_NAMES[key]);
    if (!id) {
      throw new GovernError(
        `Policy type "${POLICY_TYPE_NAMES[key]}" not available in this project.`
      );
    }
    return id;
  };
  const base = (key, cfg, settings, match, scope = branchScope) => ({
    key,
    displayName: POLICY_TYPE_NAMES[key],
    type: { id: typeId(key) },
    isEnabled: cfg.enabled !== false,
    isBlocking: cfg.blocking !== false,
    settings: { ...settings, scope },
    // `match` picks the existing configuration this one converges onto (types
    // that allow several configurations per scope need a discriminator).
    match,
  });

  const mr = policies.minimumReviewers;
  if (mr) {
    out.push(
      base(
        'minimumReviewers',
        mr,
        {
          minimumApproverCount: mr.minimumApproverCount ?? 1,
          creatorVoteCounts: Boolean(mr.creatorVoteCounts),
          allowDownvotes: Boolean(mr.allowDownvotes),
          resetOnSourcePush: mr.resetOnSourcePush !== false,
          requireVoteOnLastIteration: Boolean(mr.requireVoteOnLastIteration),
          resetRejectionsOnSourcePush: Boolean(mr.resetRejectionsOnSourcePush),
          blockLastPusherVote: Boolean(mr.blockLastPusherVote),
          requireVoteOnEachIteration: Boolean(mr.requireVoteOnEachIteration),
        },
        () => true
      )
    );
  }
  if (policies.workItemLinking) {
    out.push(base('workItemLinking', policies.workItemLinking, {}, () => true));
  }
  if (policies.commentResolution) {
    out.push(base('commentResolution', policies.commentResolution, {}, () => true));
  }
  const ms = policies.mergeStrategy;
  if (ms) {
    out.push(
      base(
        'mergeStrategy',
        ms,
        {
          allowSquash: ms.allowSquash !== false,
          allowNoFastForward: Boolean(ms.allowNoFastForward),
          allowRebase: Boolean(ms.allowRebase),
          allowRebaseMerge: Boolean(ms.allowRebaseMerge),
        },
        () => true
      )
    );
  }
  for (const bv of policies.buildValidation ?? []) {
    const buildDefinitionId =
      bv.buildDefinitionId ?? (await resolvers.buildDefinition(bv.pipeline));
    out.push(
      base(
        'buildValidation',
        bv,
        {
          buildDefinitionId,
          displayName: bv.displayName ?? bv.pipeline ?? `Build ${buildDefinitionId}`,
          queueOnSourceUpdateOnly: bv.queueOnSourceUpdateOnly !== false,
          manualQueueOnly: Boolean(bv.manualQueueOnly),
          validDuration: bv.validDuration ?? 720, // minutes; 0 = never expires
          ...(bv.paths?.length ? { filenamePatterns: bv.paths } : {}),
        },
        (existing) => existing.settings?.buildDefinitionId === buildDefinitionId
      )
    );
  }
  for (const rr of policies.requiredReviewers ?? []) {
    const requiredReviewerIds = [];
    for (const r of rr.reviewers ?? []) requiredReviewerIds.push(await resolvers.identity(r));
    if (!requiredReviewerIds.length) {
      throw new GovernError('requiredReviewers entries need at least one reviewer.');
    }
    const filenamePatterns = rr.paths ?? [];
    out.push(
      base(
        'requiredReviewers',
        rr,
        {
          requiredReviewerIds,
          minimumApproverCount: rr.minimumApproverCount ?? 1,
          creatorVoteCounts: Boolean(rr.creatorVoteCounts),
          filenamePatterns,
          addedFilesOnly: Boolean(rr.addedFilesOnly),
          ...(rr.message ? { message: rr.message } : {}),
        },
        (existing) => sameSet(existing.settings?.filenamePatterns ?? [], filenamePatterns)
      )
    );
  }
  for (const sc of policies.statusChecks ?? []) {
    out.push(
      base(
        'statusChecks',
        sc,
        {
          statusGenre: sc.genre,
          statusName: sc.name,
          invalidateOnSourceUpdate: sc.invalidateOnSourceUpdate !== false,
          policyApplicability: sc.applicability ?? 0, // 0 = always required
          defaultDisplayName: sc.displayName ?? `${sc.genre}/${sc.name}`,
          ...(sc.authorId ? { authorId: sc.authorId } : {}),
        },
        (existing) =>
          existing.settings?.statusGenre === sc.genre && existing.settings?.statusName === sc.name
      )
    );
  }

  // ── Repository-scoped hygiene policies ──────────────────────────────────
  const rs = repositorySettings;
  if (rs) {
    const on = { enabled: true, blocking: true };
    if (rs.caseEnforcement) {
      out.push(base('caseEnforcement', on, { enforceConsistentCase: true }, () => true, repoScope));
    }
    if (rs.reservedNames) out.push(base('reservedNames', on, {}, () => true, repoScope));
    if (rs.maxPathLength > 0) {
      out.push(
        base('maxPathLength', on, { maxPathLength: rs.maxPathLength }, () => true, repoScope)
      );
    }
    if (rs.maxFileSizeMB > 0) {
      out.push(
        base(
          'maxFileSize',
          on,
          {
            maximumGitBlobSizeInBytes: Math.round(rs.maxFileSizeMB * 1024 * 1024),
            useUncompressedSize: false,
          },
          () => true,
          repoScope
        )
      );
    }
    if (rs.authorEmailPatterns?.length) {
      out.push(
        base(
          'authorEmail',
          on,
          { authorEmailPatterns: rs.authorEmailPatterns },
          () => true,
          repoScope
        )
      );
    }
    if (rs.blockedFilePatterns?.length) {
      out.push(
        base(
          'blockedFiles',
          on,
          { filenamePatterns: rs.blockedFilePatterns },
          () => true,
          repoScope
        )
      );
    }
  }
  return out;
}

function sameSet(a, b) {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// Does `existing` already carry every desired field (ignoring extra server fields)?
export function subsetEqual(desired, existing) {
  if (Array.isArray(desired)) {
    return (
      Array.isArray(existing) &&
      desired.length === existing.length &&
      desired.every((d, i) => subsetEqual(d, existing[i]))
    );
  }
  if (desired && typeof desired === 'object') {
    if (!existing || typeof existing !== 'object') return false;
    return Object.entries(desired).every(([k, v]) => subsetEqual(v, existing[k]));
  }
  return desired === existing;
}

// Existing configurations that target this repo: the branch scope (exact ref) or
// the repository scope (no ref) — never other branches.
function scopedTo(configuration, repositoryId, refName) {
  return (configuration.settings?.scope ?? []).some(
    (s) => s.repositoryId === repositoryId && (!s.refName || s.refName === refName)
  );
}

// Plan create/update/delete/same for one repo. Pure given the inputs.
export function planPolicies(desired, existing, { managedTypeIds, prune }) {
  const plan = [];
  const claimed = new Set();
  for (const d of desired) {
    const candidates = existing.filter(
      (e) => e.type?.id === d.type.id && !claimed.has(e.id) && d.match(e)
    );
    const current = candidates[0];
    if (!current) {
      plan.push({ action: 'create', desired: d });
      continue;
    }
    claimed.add(current.id);
    const same =
      current.isEnabled === d.isEnabled &&
      current.isBlocking === d.isBlocking &&
      subsetEqual(d.settings, current.settings);
    plan.push({ action: same ? 'same' : 'update', desired: d, current });
  }
  if (prune) {
    for (const e of existing) {
      if (!claimed.has(e.id) && managedTypeIds.has(e.type?.id)) {
        plan.push({ action: 'delete', current: e });
      }
    }
  }
  return plan;
}

export async function applyBranchPolicies(ctx, { project, repo, azure, prune = false }) {
  const { client, dryRun } = ctx;
  const repoInfo = await getRepo(client, project, repo);
  const repositoryId = repoInfo.id;
  const refName = refNameFor(azure.defaultBranch || repoInfo.defaultBranch || 'main');

  const typeIds = await loadPolicyTypes(client, project);
  const managedTypeIds = new Set(
    Object.values(POLICY_TYPE_NAMES)
      .map((n) => typeIds.get(n))
      .filter(Boolean)
  );

  const desired = await desiredPolicies(azure.policies ?? {}, {
    repositoryId,
    refName,
    typeIds,
    repositorySettings: azure.repositorySettings,
    resolvers: {
      buildDefinition: (name) => resolveBuildDefinition(client, project, name),
      identity: (value) => resolveIdentity(client, value),
    },
  });

  const all = (await client.get(`${p(project)}/_apis/policy/configurations`))?.value ?? [];
  const existing = all.filter((c) => scopedTo(c, repositoryId, refName));
  const plan = planPolicies(desired, existing, { managedTypeIds, prune });

  const branch = refName.replace('refs/heads/', '');
  const label = (d) => {
    const where = d.settings.scope[0]?.refName ? `${repo}@${branch}` : `${repo} (repository)`;
    return `${d.displayName}${d.isBlocking ? '' : ' (optional)'} on ${where}`;
  };
  for (const step of plan) {
    if (step.action === 'same') {
      log.same(label(step.desired));
      continue;
    }
    if (step.action === 'create') {
      if (dryRun) log.plan(`create ${label(step.desired)}`);
      else {
        await client.post(`${p(project)}/_apis/policy/configurations`, payload(step.desired));
        log.add(label(step.desired));
      }
      continue;
    }
    if (step.action === 'update') {
      if (dryRun) log.plan(`update ${label(step.desired)}`);
      else {
        await client.put(
          `${p(project)}/_apis/policy/configurations/${step.current.id}`,
          payload(step.desired)
        );
        log.edit(label(step.desired));
      }
      continue;
    }
    // delete
    const name = step.current.type?.displayName ?? step.current.type?.id;
    if (dryRun) log.plan(`delete ${name} #${step.current.id} (not in config; --prune)`);
    else {
      await client.delete(`${p(project)}/_apis/policy/configurations/${step.current.id}`);
      log.edit(`deleted ${name} #${step.current.id}`);
    }
  }
  return plan;
}

function payload(d) {
  return { isEnabled: d.isEnabled, isBlocking: d.isBlocking, type: d.type, settings: d.settings };
}
