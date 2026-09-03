import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authHeaderFor,
  identityBaseFor,
  makeAzureClient,
  resolveOrgUrl,
} from '../lib/govern/azure/client.js';
import {
  applyBranchPolicies,
  desiredPolicies,
  planPolicies,
  POLICY_TYPE_NAMES,
  subsetEqual,
} from '../lib/govern/azure/policies.js';
import { resolveAzureConfig } from '../lib/govern/azure/index.js';
import azureDefaults from '../lib/govern/azure/defaults.js';

// The branch-policy tests below ignore the repository-level hygiene policies (covered in
// govern-azure-addons.test.js).
const branchOnly = { ...azureDefaults, repositorySettings: null };

const TYPE_IDS = new Map(Object.values(POLICY_TYPE_NAMES).map((name, i) => [name, `type-${i}`]));
const REPO = 'repo-1111';
const REF = 'refs/heads/main';

test('resolveOrgUrl accepts a bare org name or a full URL', () => {
  assert.equal(resolveOrgUrl('contoso'), 'https://dev.azure.com/contoso');
  assert.equal(resolveOrgUrl('https://dev.azure.com/contoso/'), 'https://dev.azure.com/contoso');
  assert.equal(
    resolveOrgUrl('https://contoso.visualstudio.com'),
    'https://contoso.visualstudio.com'
  );
});

test('resolveOrgUrl refuses to send the token to unexpected hosts or over http', () => {
  assert.throws(() => resolveOrgUrl('http://dev.azure.com/contoso'), /must use https/);
  assert.throws(
    () => resolveOrgUrl('https://evil.example.com/contoso'),
    /Refusing to send credentials/
  );
  assert.throws(() => resolveOrgUrl('https://dev.azure.com.evil.example/contoso'), /Refusing/);
  // Azure DevOps Server: explicit opt-in per host
  assert.equal(
    resolveOrgUrl('https://ado.internal/tfs/Default', { trustedHosts: ['ADO.internal'] }),
    'https://ado.internal/tfs/Default'
  );
  assert.throws(() => resolveOrgUrl('not a url://x'), /Invalid Azure DevOps organization URL/);
});

test('identity API base is derived from the org URL', () => {
  assert.equal(
    identityBaseFor('https://dev.azure.com/contoso'),
    'https://vssps.dev.azure.com/contoso'
  );
  assert.equal(
    identityBaseFor('https://contoso.visualstudio.com'),
    'https://contoso.vssps.visualstudio.com'
  );
  assert.equal(
    identityBaseFor('https://ado.internal/tfs/Default'),
    'https://ado.internal/tfs/Default'
  );
});

test('PATs use Basic auth with an empty user; JWTs use Bearer', () => {
  assert.equal(authHeaderFor('abc123pat'), `Basic ${Buffer.from(':abc123pat').toString('base64')}`);
  assert.equal(
    authHeaderFor('eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl'),
    'Bearer eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl'
  );
});

test('resolveAzureConfig layers defaults ← file ← flags/env', () => {
  const cfg = resolveAzureConfig(
    {
      azure: {
        organization: 'https://dev.azure.com/file-org',
        policies: { minimumReviewers: { minimumApproverCount: 2 } },
      },
    },
    { project: 'FromFlag' },
    { AZURE_DEVOPS_PROJECT: 'FromEnv' }
  );
  assert.equal(cfg.organization, 'https://dev.azure.com/file-org');
  assert.equal(cfg.project, 'FromFlag');
  assert.equal(cfg.policies.minimumReviewers.minimumApproverCount, 2);
  assert.equal(cfg.policies.minimumReviewers.resetOnSourcePush, true); // default kept
  assert.equal(cfg.policies.mergeStrategy.allowSquash, true);

  const fromEnv = resolveAzureConfig({}, {}, { AZURE_DEVOPS_PROJECT: 'FromEnv' });
  assert.equal(fromEnv.project, 'FromEnv');
});

test('desiredPolicies builds every default policy scoped to the branch', async () => {
  const desired = await desiredPolicies(azureDefaults.policies, {
    repositoryId: REPO,
    refName: REF,
    typeIds: TYPE_IDS,
    resolvers: {},
  });
  const keys = desired.map((d) => d.key).sort();
  assert.deepEqual(keys, [
    'commentResolution',
    'mergeStrategy',
    'minimumReviewers',
    'workItemLinking',
  ]);
  for (const d of desired) {
    assert.deepEqual(d.settings.scope, [{ repositoryId: REPO, refName: REF, matchKind: 'Exact' }]);
    assert.equal(d.isBlocking, true);
    assert.equal(d.isEnabled, true);
  }
  const merge = desired.find((d) => d.key === 'mergeStrategy');
  assert.deepEqual(
    { ...merge.settings, scope: undefined },
    {
      allowSquash: true,
      allowNoFastForward: false,
      allowRebase: false,
      allowRebaseMerge: false,
      scope: undefined,
    }
  );
});

test('desiredPolicies resolves pipelines and reviewers through the injected resolvers', async () => {
  const desired = await desiredPolicies(
    {
      buildValidation: [{ pipeline: 'CI', validDuration: 60 }],
      requiredReviewers: [
        {
          reviewers: ['platform@contoso.com'],
          paths: ['/.azuredevops/*'],
          message: 'Platform review',
        },
      ],
      statusChecks: [{ genre: 'sonarcloud', name: 'quality-gate', blocking: false }],
    },
    {
      repositoryId: REPO,
      refName: REF,
      typeIds: TYPE_IDS,
      resolvers: {
        buildDefinition: async (name) => (name === 'CI' ? 42 : null),
        identity: async (v) => `id-for-${v}`,
      },
    }
  );
  const build = desired.find((d) => d.key === 'buildValidation');
  assert.equal(build.settings.buildDefinitionId, 42);
  assert.equal(build.settings.displayName, 'CI');
  assert.equal(build.settings.validDuration, 60);
  const reviewers = desired.find((d) => d.key === 'requiredReviewers');
  assert.deepEqual(reviewers.settings.requiredReviewerIds, ['id-for-platform@contoso.com']);
  assert.deepEqual(reviewers.settings.filenamePatterns, ['/.azuredevops/*']);
  const status = desired.find((d) => d.key === 'statusChecks');
  assert.equal(status.isBlocking, false);
  assert.equal(status.settings.statusGenre, 'sonarcloud');
});

test('desiredPolicies fails clearly when the project lacks a policy type', async () => {
  await assert.rejects(
    desiredPolicies(
      { workItemLinking: {} },
      { repositoryId: REPO, refName: REF, typeIds: new Map(), resolvers: {} }
    ),
    /Policy type "Work item linking" not available/
  );
});

test('subsetEqual ignores extra server-side fields but catches differences', () => {
  assert.equal(subsetEqual({ a: 1, s: [{ x: 1 }] }, { a: 1, b: 2, s: [{ x: 1, y: 2 }] }), true);
  assert.equal(subsetEqual({ a: 1 }, { a: 2 }), false);
  assert.equal(subsetEqual({ s: [1, 2] }, { s: [1] }), false);
});

test('planPolicies converges: create missing, update drifted, keep same, prune extras', async () => {
  const desired = await desiredPolicies(azureDefaults.policies, {
    repositoryId: REPO,
    refName: REF,
    typeIds: TYPE_IDS,
    resolvers: {},
  });
  const scope = [{ repositoryId: REPO, refName: REF, matchKind: 'Exact' }];
  const existing = [
    // same as desired
    {
      id: 1,
      type: { id: TYPE_IDS.get('Work item linking') },
      isEnabled: true,
      isBlocking: true,
      settings: { scope },
    },
    // drifted (2 reviewers required, we want 1)
    {
      id: 2,
      type: { id: TYPE_IDS.get('Minimum number of reviewers') },
      isEnabled: true,
      isBlocking: true,
      settings: {
        minimumApproverCount: 2,
        creatorVoteCounts: false,
        allowDownvotes: false,
        resetOnSourcePush: true,
        requireVoteOnLastIteration: true,
        resetRejectionsOnSourcePush: false,
        blockLastPusherVote: true,
        requireVoteOnEachIteration: false,
        scope,
      },
    },
    // managed type not in config → pruned
    {
      id: 3,
      type: { id: TYPE_IDS.get('Build') },
      isEnabled: true,
      isBlocking: true,
      settings: { buildDefinitionId: 9, scope },
    },
  ];
  const managed = new Set(TYPE_IDS.values());
  const plan = planPolicies(desired, existing, { managedTypeIds: managed, prune: true });
  const byKey = Object.fromEntries(
    plan.filter((p) => p.desired).map((p) => [p.desired.key, p.action])
  );
  assert.equal(byKey.workItemLinking, 'same');
  assert.equal(byKey.minimumReviewers, 'update');
  assert.equal(byKey.commentResolution, 'create');
  assert.equal(byKey.mergeStrategy, 'create');
  assert.deepEqual(
    plan.filter((p) => p.action === 'delete').map((p) => p.current.id),
    [3]
  );

  const noPrune = planPolicies(desired, existing, { managedTypeIds: managed, prune: false });
  assert.equal(noPrune.filter((p) => p.action === 'delete').length, 0);
});

// A fake client that answers the REST calls applyBranchPolicies makes.
function fakeClient({ existing = [] } = {}) {
  const calls = [];
  const types = [...TYPE_IDS.entries()].map(([displayName, id]) => ({ id, displayName }));
  return {
    calls,
    orgUrl: 'https://dev.azure.com/contoso',
    identityBase: 'https://vssps.dev.azure.com/contoso',
    async get(path) {
      calls.push(['GET', path]);
      if (path.endsWith('/_apis/git/repositories/payments-api'))
        return { id: REPO, name: 'payments-api', defaultBranch: REF };
      if (path.endsWith('/_apis/policy/types')) return { value: types };
      if (path.endsWith('/_apis/policy/configurations')) return { value: existing };
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path, body) {
      calls.push(['POST', path, body]);
      return { id: 99, ...body };
    },
    async put(path, body) {
      calls.push(['PUT', path, body]);
      return body;
    },
    async delete(path) {
      calls.push(['DELETE', path]);
    },
  };
}

test('applyBranchPolicies in dry-run plans without mutating', async () => {
  const client = fakeClient();
  const plan = await applyBranchPolicies(
    { client, dryRun: true },
    { project: 'Platform', repo: 'payments-api', azure: branchOnly }
  );
  assert.equal(plan.filter((p) => p.action === 'create').length, 4);
  assert.ok(
    client.calls.every(([method]) => method === 'GET'),
    'dry-run must only read'
  );
});

test('applyBranchPolicies creates, updates and deletes through the REST API', async () => {
  const scope = [{ repositoryId: REPO, refName: REF, matchKind: 'Exact' }];
  const client = fakeClient({
    existing: [
      {
        id: 7,
        type: { id: TYPE_IDS.get('Require a merge strategy') },
        isEnabled: true,
        isBlocking: true,
        settings: {
          allowSquash: false,
          allowNoFastForward: true,
          allowRebase: false,
          allowRebaseMerge: false,
          scope,
        },
      },
      {
        id: 8,
        type: { id: TYPE_IDS.get('Status') },
        isEnabled: true,
        isBlocking: true,
        settings: { statusGenre: 'x', statusName: 'y', scope },
      },
    ],
  });
  await applyBranchPolicies(
    { client, dryRun: false },
    { project: 'Platform', repo: 'payments-api', azure: branchOnly, prune: true }
  );
  const posts = client.calls.filter(([m]) => m === 'POST');
  const puts = client.calls.filter(([m]) => m === 'PUT');
  const dels = client.calls.filter(([m]) => m === 'DELETE');
  assert.equal(posts.length, 3, 'reviewers, work items, comments created');
  assert.equal(puts.length, 1, 'merge strategy updated in place');
  assert.match(puts[0][1], /\/_apis\/policy\/configurations\/7$/);
  assert.equal(puts[0][2].settings.allowSquash, true);
  assert.deepEqual(
    dels.map(([, p]) => p),
    ['Platform/_apis/policy/configurations/8']
  );
  for (const [, , body] of posts) {
    assert.deepEqual(Object.keys(body).sort(), ['isBlocking', 'isEnabled', 'settings', 'type']);
  }
});

test('makeAzureClient sets api-version, auth header and surfaces API errors', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), init });
    if (String(url).includes('boom')) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => JSON.stringify({ message: 'TF401019: repo not found' }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ value: [1] }) };
  };
  const client = makeAzureClient({
    orgUrl: 'https://dev.azure.com/contoso',
    token: 'pat',
    fetchImpl,
  });
  const data = await client.get('Platform/_apis/git/repositories', { query: { $top: 5 } });
  assert.deepEqual(data, { value: [1] });
  assert.match(
    seen[0].url,
    /^https:\/\/dev\.azure\.com\/contoso\/Platform\/_apis\/git\/repositories\?/
  );
  assert.match(seen[0].url, /api-version=7\.1/);
  assert.match(seen[0].url, /%24top=5/);
  assert.match(seen[0].init.headers.Authorization, /^Basic /);
  await assert.rejects(client.get('boom'), /TF401019/);
});
