// Actions / Dependabot secrets (libsodium sealed-box encrypted) and Actions
// variables (plaintext), at repo or org scope.
//
// Secret VALUES never live in the config file — each entry names an env var to
// read the value from (`from: ENV_NAME`, defaulting to the secret name). Actions
// and Dependabot use SEPARATE public keys; we always fetch the matching one.

import { log, GovernError } from './util.js';
import { encryptSecret } from './octokit.js';

function readValue(entry) {
  const envName = entry.from || entry.name;
  const value = process.env[envName];
  if (value == null || value === '') {
    throw new GovernError(`Secret "${entry.name}" has no value: env var ${envName} is unset.`);
  }
  return value;
}

// secrets = { actions: [...], dependabot: [...] }, each entry:
//   { name, from?: ENV, visibility?: all|private|selected, selected_repository_ids?: [] }
// `scope` is 'repo' (needs repo) or 'org'.
export async function applySecrets(ctx, secrets = {}, { scope, repo } = {}) {
  const { octokit, org, dryRun } = ctx;
  const groups = [
    { kind: 'actions', api: octokit.rest.actions, list: secrets.actions || [] },
    { kind: 'dependabot', api: octokit.rest.dependabot, list: secrets.dependabot || [] },
  ];

  for (const { kind, api, list } of groups) {
    if (!list.length) continue;

    // Fetch the matching public key once per group.
    let pubKey;
    if (!dryRun) {
      const { data } =
        scope === 'org'
          ? await api.getOrgPublicKey({ org })
          : await api.getRepoPublicKey({ owner: org, repo });
      pubKey = data;
    }

    for (const entry of list) {
      if (dryRun) {
        log.plan(`set ${kind} secret ${entry.name} (${scope})`);
        readValue(entry); // surface missing-env errors during a dry-run too
        continue;
      }
      const encrypted_value = await encryptSecret(readValue(entry), pubKey.key);
      if (scope === 'org') {
        await api.createOrUpdateOrgSecret({
          org,
          secret_name: entry.name,
          encrypted_value,
          key_id: pubKey.key_id,
          visibility: entry.visibility || 'all',
          ...(entry.visibility === 'selected'
            ? { selected_repository_ids: entry.selected_repository_ids || [] }
            : {}),
        });
      } else {
        await api.createOrUpdateRepoSecret({
          owner: org,
          repo,
          secret_name: entry.name,
          encrypted_value,
          key_id: pubKey.key_id,
        });
      }
      log.add(`${kind} secret ${entry.name}`);
    }
  }
}

// variables = [{ name, value, visibility?: all|private|selected, selected_repository_ids? }]
export async function applyVariables(ctx, variables = [], { scope, repo } = {}) {
  const { octokit, org, dryRun } = ctx;
  if (!variables.length) return;

  for (const v of variables) {
    if (dryRun) {
      log.plan(`set variable ${v.name} (${scope})`);
      continue;
    }
    if (scope === 'org') {
      await upsert(
        () => octokit.rest.actions.createOrgVariable({ org, name: v.name, value: v.value, visibility: v.visibility || 'all', ...(v.visibility === 'selected' ? { selected_repository_ids: v.selected_repository_ids || [] } : {}) }),
        () => octokit.rest.actions.updateOrgVariable({ org, name: v.name, value: v.value, visibility: v.visibility || 'all', ...(v.visibility === 'selected' ? { selected_repository_ids: v.selected_repository_ids || [] } : {}) })
      );
    } else {
      await upsert(
        () => octokit.rest.actions.createRepoVariable({ owner: org, repo, name: v.name, value: v.value }),
        () => octokit.rest.actions.updateRepoVariable({ owner: org, repo, name: v.name, value: v.value })
      );
    }
    log.add(`variable ${v.name}`);
  }
}

// Try create; on 409/422 (already exists) fall back to update.
async function upsert(create, update) {
  try {
    await create();
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    if (status === 409 || status === 422) await update();
    else throw err;
  }
}
