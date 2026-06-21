// Octokit client factory + small primitives shared by every operation module.
//
// Auth resolution order:
//   1. explicit token argument (e.g. --token)
//   2. GITHUB_TOKEN / GH_TOKEN env var (PAT — classic or fine-grained)
//   3. GitHub App creds (APP_ID + APP_PRIVATE_KEY + APP_INSTALLATION_ID)
//
// We deliberately do NOT pin X-GitHub-Api-Version — Octokit tracks the current
// default, and pinning the wrong dated version is a common source of breakage.

import { requireDep, GovernError } from './util.js';

let _sodium; // cached libsodium instance (loads WASM asynchronously)

// Build an authenticated, throttled, auto-retrying Octokit client.
export async function makeOctokit({ token, userAgent = 'devkit-govern' } = {}) {
  const { Octokit } = await requireDep('@octokit/rest');
  const { throttling } = await requireDep('@octokit/plugin-throttling');
  const { retry } = await requireDep('@octokit/plugin-retry');
  const Client = Octokit.plugin(throttling, retry);

  const throttle = {
    onRateLimit: (retryAfter, options, ok, retryCount) => {
      ok.log.warn(`Rate limit for ${options.method} ${options.url}`);
      return retryCount < 3; // retry up to 3x, honouring retry-after
    },
    onSecondaryRateLimit: (retryAfter, options, ok) => {
      ok.log.warn(`Secondary (abuse) rate limit for ${options.method} ${options.url}`);
      return true; // always back off and retry once
    },
  };

  const resolved = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (resolved) {
    return new Client({ auth: resolved, userAgent, throttle });
  }

  // Fall back to GitHub App installation auth if configured.
  const appId = process.env.APP_ID;
  const privateKey = process.env.APP_PRIVATE_KEY;
  const installationId = process.env.APP_INSTALLATION_ID;
  if (appId && privateKey && installationId) {
    const { createAppAuth } = await requireDep('@octokit/auth-app');
    return new Client({
      authStrategy: createAppAuth,
      auth: { appId: Number(appId), privateKey, installationId: Number(installationId) },
      userAgent,
      throttle,
    });
  }

  throw new GovernError(
    'No GitHub credentials found.\n' +
      '  Set a token:   $env:GITHUB_TOKEN = "ghp_..."   (PowerShell)\n' +
      '                 export GITHUB_TOKEN=ghp_...      (bash)\n' +
      '  …or pass --token, or set APP_ID + APP_PRIVATE_KEY + APP_INSTALLATION_ID for App auth.\n' +
      '  Needs: repo admin + (for org ops) admin:org; for Projects v2 a PAT/App token, not GITHUB_TOKEN.'
  );
}

// libsodium sealed-box encryption for Actions/Dependabot secrets.
// publicKey is the base64 key from the *matching* public-key endpoint.
export async function encryptSecret(plaintext, publicKeyBase64) {
  if (!_sodium) {
    const mod = await requireDep('libsodium-wrappers');
    const sodium = mod.default ?? mod;
    await sodium.ready; // WASM loads asynchronously — must await before use
    _sodium = sodium;
  }
  const sodium = _sodium;
  const binKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const binSec = sodium.from_string(plaintext);
  const sealed = sodium.crypto_box_seal(binSec, binKey);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

// Thin GraphQL helper (Projects v2 has no REST API). Returns response.data,
// throwing on GraphQL errors with a readable message.
export async function graphql(octokit, query, variables = {}) {
  try {
    return await octokit.graphql(query, variables);
  } catch (err) {
    // octokit.graphql throws GraphqlResponseError with .errors
    const gqlErrors = err?.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length) {
      throw new GovernError('GraphQL error: ' + gqlErrors.map((e) => e.message).join('; '));
    }
    throw err;
  }
}

// Resolve { name, full_name, id, visibility, default_branch, node_id } for a repo.
export async function getRepo(octokit, owner, repo) {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data;
}

// Paginate every repo in an org (excludes archived by default).
export async function listOrgRepos(octokit, org, { includeArchived = false } = {}) {
  const all = await octokit.paginate(octokit.rest.repos.listForOrg, { org, per_page: 100, type: 'all' });
  return includeArchived ? all : all.filter((r) => !r.archived);
}
