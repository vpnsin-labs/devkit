// Repository / organization webhooks — idempotent by config.url (creating the
// same webhook twice otherwise yields duplicates; the API does not 422).
//
// config.content_type defaults to 'form' in the API — we force 'json'.
// insecure_ssl must be the STRING '0' or '1' (coerced here). The optional secret
// is read from an env var named by `secretFrom` (never inlined); if `secretFrom`
// is set but the env var is missing we fail loudly rather than create a webhook
// silently missing its signing secret.

import { log, GovernError } from './util.js';
import defaults from './defaults.js';

// Build the webhook `config` object from a hook entry.
function buildConfig(hook) {
  const config = {
    url: hook.url,
    content_type: hook.content_type || defaults.webhookConfigDefaults.content_type,
    insecure_ssl: String(hook.insecure_ssl ?? defaults.webhookConfigDefaults.insecure_ssl),
  };
  if (hook.secretFrom) {
    const secret = process.env[hook.secretFrom];
    if (!secret) {
      throw new GovernError(`Webhook ${hook.url}: env var ${hook.secretFrom} (secretFrom) is unset.`);
    }
    config.secret = secret;
  }
  return config;
}

// Create or update a single webhook. `api` is the orgs/repos namespace and
// `scopeParams` carries either { org } or { owner, repo }.
async function upsertHook(api, scopeParams, hook, match) {
  const config = buildConfig(hook);
  const events = hook.events || ['push'];
  const active = hook.active ?? true;
  if (match) {
    await api.updateWebhook({ ...scopeParams, hook_id: match.id, config, events, active });
    log.edit(`webhook ${hook.url}`);
  } else {
    await api.createWebhook({ ...scopeParams, name: 'web', config, events, active });
    log.add(`webhook ${hook.url}`);
  }
}

// hooks = [{ url, events?: [], active?, content_type?, insecure_ssl?, secretFrom?: ENV }]
export async function applyWebhooks(ctx, hooks = [], { scope, repo } = {}) {
  const { octokit, org, dryRun } = ctx;
  if (!hooks.length) return;
  const isOrg = scope === 'org';
  const api = isOrg ? octokit.rest.orgs : octokit.rest.repos;
  const scopeParams = isOrg ? { org } : { owner: org, repo };

  const existing = await octokit.paginate(api.listWebhooks, scopeParams);
  const byUrl = new Map(existing.map((h) => [h.config?.url, h]));

  for (const hook of hooks) {
    const match = byUrl.get(hook.url);
    if (dryRun) {
      buildConfig(hook); // surface missing-secret errors during dry-run too
      log.plan(`${match ? 'update' : 'create'} webhook ${hook.url} (${scope})`);
      continue;
    }
    await upsertHook(api, scopeParams, hook, match);
  }
}
