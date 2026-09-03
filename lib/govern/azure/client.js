// Minimal Azure DevOps REST client on the built-in fetch (Node ≥ 18) — no extra
// dependencies. Authenticates with a Personal Access Token (Basic auth, empty
// user) or a pipeline/Entra bearer token (JWT).
//
// Credential resolution: --token → AZURE_DEVOPS_EXT_PAT (the `az devops` CLI
// variable) → AZDO_PERSONAL_ACCESS_TOKEN → AZURE_DEVOPS_PAT → SYSTEM_ACCESSTOKEN
// (inside Azure Pipelines).
// Org URL resolution: --org-url → azure.organization in the config →
// AZURE_DEVOPS_ORG_URL → AZDO_ORG_SERVICE_URL → SYSTEM_COLLECTIONURI.

import { GovernError } from '../util.js';

export const API_VERSION = '7.1';

export function resolveOrgUrl(explicit) {
  const raw =
    explicit ||
    process.env.AZURE_DEVOPS_ORG_URL ||
    process.env.AZDO_ORG_SERVICE_URL ||
    process.env.SYSTEM_COLLECTIONURI;
  if (!raw) {
    throw new GovernError(
      'No Azure DevOps organization configured.\n' +
        '  Set azure.organization in governance.config.yml, pass --org-url https://dev.azure.com/<org>,\n' +
        '  or export AZURE_DEVOPS_ORG_URL.'
    );
  }
  let url = String(raw).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://dev.azure.com/${url}`; // bare org name
  return url;
}

export function resolveToken(explicit) {
  const token =
    explicit ||
    process.env.AZURE_DEVOPS_EXT_PAT ||
    process.env.AZDO_PERSONAL_ACCESS_TOKEN ||
    process.env.AZURE_DEVOPS_PAT ||
    process.env.SYSTEM_ACCESSTOKEN;
  if (!token) {
    throw new GovernError(
      'No Azure DevOps credentials found.\n' +
        '  Set a PAT:   $env:AZURE_DEVOPS_EXT_PAT = "..."   (PowerShell)\n' +
        '               export AZURE_DEVOPS_EXT_PAT=...      (bash)\n' +
        '  …or pass --token. Needs scopes: Code (Read & write), Project and Team (Read),\n' +
        '  Build (Read) for build validation, Graph/Identity (Read) for required reviewers.'
    );
  }
  return token;
}

// https://dev.azure.com/<org> → https://vssps.dev.azure.com/<org> (identities API);
// https://<org>.visualstudio.com → https://<org>.vssps.visualstudio.com
export function identityBaseFor(orgUrl) {
  const u = new URL(orgUrl);
  if (/^dev\.azure\.com$/i.test(u.hostname)) {
    return `https://vssps.dev.azure.com${u.pathname.replace(/\/+$/, '')}`;
  }
  const m = /^([^.]+)\.visualstudio\.com$/i.exec(u.hostname);
  if (m) return `https://${m[1]}.vssps.visualstudio.com`;
  return orgUrl; // on-prem Azure DevOps Server: same collection host
}

// Bearer tokens (pipeline System.AccessToken, Entra access tokens) are JWTs;
// anything else is treated as a PAT.
export function authHeaderFor(token) {
  const looksLikeJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
  return looksLikeJwt ? `Bearer ${token}` : `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
}

export function makeAzureClient({ orgUrl, token, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new GovernError('global fetch is unavailable — devkit govern azure needs Node.js 18+.');
  }
  const authorization = authHeaderFor(token);
  const identityBase = identityBaseFor(orgUrl);

  async function request(
    method,
    path,
    { body, query, base = orgUrl, apiVersion = API_VERSION } = {}
  ) {
    const url = new URL(/^https?:\/\//i.test(path) ? path : `${base}/${path.replace(/^\/+/, '')}`);
    url.searchParams.set('api-version', apiVersion);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text; // non-JSON body (e.g. an HTML sign-in page)
    }
    // Azure DevOps answers a bad/expired PAT with 203 + the HTML sign-in page.
    if (res.status === 203 || (res.ok && typeof data === 'string' && /<html/i.test(data))) {
      const err = new Error('authentication failed (redirected to sign-in) — check the PAT/token');
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(
        (data && typeof data === 'object' && data.message) || `${res.status} ${res.statusText}`
      );
      err.status = res.status;
      err.response = { status: res.status, data };
      throw err;
    }
    return data;
  }

  return {
    orgUrl,
    identityBase,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}

// ── Common lookups ──────────────────────────────────────────────────────────
export async function getProject(client, project) {
  return client.get(`_apis/projects/${encodeURIComponent(project)}`);
}

export async function listProjects(client) {
  const data = await client.get('_apis/projects', { query: { $top: 200 } });
  return data?.value ?? [];
}

export async function getRepo(client, project, repo) {
  return client.get(
    `${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repo)}`
  );
}

export async function listRepos(client, project) {
  const data = await client.get(`${encodeURIComponent(project)}/_apis/git/repositories`);
  return (data?.value ?? []).filter((r) => !r.isDisabled);
}

// Resolve a reviewer (user email / display name / "[Project]\Team" group) to an identity id.
export async function resolveIdentity(client, value) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
  const data = await client.get('_apis/identities', {
    base: client.identityBase,
    query: { searchFilter: 'General', filterValue: value, queryMembership: 'None' },
  });
  const hit = (data?.value ?? [])[0];
  if (!hit?.id)
    throw new GovernError(`Could not resolve reviewer "${value}" to an Azure DevOps identity.`);
  return hit.id;
}

// Resolve a pipeline (build definition) by name → id.
export async function resolveBuildDefinition(client, project, name) {
  const data = await client.get(`${encodeURIComponent(project)}/_apis/build/definitions`, {
    query: { name },
  });
  const hit = (data?.value ?? [])[0];
  if (!hit?.id) {
    throw new GovernError(
      `Pipeline "${name}" not found in project ${project} — create it first (Pipelines → New → Existing YAML).`
    );
  }
  return hit.id;
}
