import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import {
  desiredPolicies,
  planPolicies,
  POLICY_TYPE_NAMES,
  applyBranchPolicies,
} from '../lib/govern/azure/policies.js';
import azureDefaults from '../lib/govern/azure/defaults.js';
import {
  codeownersPatternToAzure,
  codeownersToRequiredReviewers,
  ownerToReviewer,
  parseCodeowners,
} from '../lib/govern/azure/codeowners.js';
import { applyCodeownersFlag } from '../lib/govern/azure/index.js';
import { normalizeMappedPath, publishCodeWiki } from '../lib/govern/azure/wiki.js';
import {
  PIPELINE_TEMPLATE_FILES,
  scaffoldPipelineTemplates,
} from '../lib/govern/azure/scaffold.js';

const TYPE_IDS = new Map(Object.values(POLICY_TYPE_NAMES).map((name, i) => [name, `type-${i}`]));
const REPO = 'repo-1111';
const REF = 'refs/heads/main';
const ctxOf = (client, dryRun = false) => ({ client, dryRun });

test('repositorySettings produce repository-scoped hygiene policies', async () => {
  const desired = await desiredPolicies(
    {},
    {
      repositoryId: REPO,
      refName: REF,
      typeIds: TYPE_IDS,
      resolvers: {},
      repositorySettings: {
        ...azureDefaults.repositorySettings,
        authorEmailPatterns: ['*@contoso.com'],
        blockedFilePatterns: ['*.pfx'],
      },
    }
  );
  assert.deepEqual(desired.map((d) => d.key).sort(), [
    'authorEmail',
    'blockedFiles',
    'caseEnforcement',
    'maxFileSize',
    'maxPathLength',
    'reservedNames',
  ]);
  for (const d of desired) {
    assert.deepEqual(d.settings.scope, [{ repositoryId: REPO }], `${d.key} must be repo-scoped`);
    assert.equal(d.isBlocking, true);
  }
  const size = desired.find((d) => d.key === 'maxFileSize');
  assert.equal(size.settings.maximumGitBlobSizeInBytes, 100 * 1024 * 1024);
  assert.equal(
    desired.find((d) => d.key === 'caseEnforcement').settings.enforceConsistentCase,
    true
  );
  assert.equal(desired.find((d) => d.key === 'maxPathLength').settings.maxPathLength, 248);

  // zero / empty switches things off
  const off = await desiredPolicies(
    {},
    {
      repositoryId: REPO,
      refName: REF,
      typeIds: TYPE_IDS,
      resolvers: {},
      repositorySettings: {
        caseEnforcement: false,
        reservedNames: false,
        maxPathLength: 0,
        maxFileSizeMB: 0,
      },
    }
  );
  assert.equal(off.length, 0);
});

test('existing repo-scoped configurations converge in place and other branches are never pruned', async () => {
  const desired = await desiredPolicies(azureDefaults.policies, {
    repositoryId: REPO,
    refName: REF,
    typeIds: TYPE_IDS,
    resolvers: {},
    repositorySettings: azureDefaults.repositorySettings,
  });
  const existing = [
    // repo-scoped, already correct
    {
      id: 1,
      type: { id: TYPE_IDS.get('Reserved names restriction') },
      isEnabled: true,
      isBlocking: true,
      settings: { scope: [{ repositoryId: REPO }] },
    },
    // repo-scoped, drifted
    {
      id: 2,
      type: { id: TYPE_IDS.get('Path Length restriction') },
      isEnabled: true,
      isBlocking: true,
      settings: { maxPathLength: 100, scope: [{ repositoryId: REPO }] },
    },
  ];
  const plan = planPolicies(desired, existing, {
    managedTypeIds: new Set(TYPE_IDS.values()),
    prune: true,
  });
  const byKey = Object.fromEntries(
    plan.filter((p) => p.desired).map((p) => [p.desired.key, p.action])
  );
  assert.equal(byKey.reservedNames, 'same');
  assert.equal(byKey.maxPathLength, 'update');
  assert.equal(byKey.caseEnforcement, 'create');
  assert.equal(plan.filter((p) => p.action === 'delete').length, 0);
});

test('applyBranchPolicies ignores configurations scoped to other branches', async () => {
  const otherBranch = {
    id: 9,
    type: { id: TYPE_IDS.get('Work item linking') },
    isEnabled: true,
    isBlocking: true,
    settings: { scope: [{ repositoryId: REPO, refName: 'refs/heads/dev', matchKind: 'Exact' }] },
  };
  const calls = [];
  const client = {
    async get(path) {
      if (path.endsWith('/_apis/git/repositories/svc'))
        return { id: REPO, name: 'svc', defaultBranch: REF };
      if (path.endsWith('/_apis/policy/types'))
        return { value: [...TYPE_IDS].map(([displayName, id]) => ({ id, displayName })) };
      if (path.endsWith('/_apis/policy/configurations')) return { value: [otherBranch] };
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path, body) {
      calls.push(['POST', body.type.id]);
      return { id: 100, ...body };
    },
    async put() {
      throw new Error('nothing to update');
    },
    async delete(path) {
      calls.push(['DELETE', path]);
    },
  };
  await applyBranchPolicies(ctxOf(client), {
    project: 'P',
    repo: 'svc',
    azure: { ...azureDefaults, repositorySettings: null },
    prune: true,
  });
  assert.equal(
    calls.filter(([m]) => m === 'DELETE').length,
    0,
    'dev branch policy must survive --prune'
  );
  assert.equal(
    calls.filter(([m]) => m === 'POST').length,
    4,
    'all four default branch policies created for main'
  );
});

test('CODEOWNERS parsing and translation', () => {
  const text = [
    '# owners',
    '*            @org/platform',
    '/.github/    @org/devops @alice',
    'docs/        docs@contoso.com',
    '*.md         @bob   # trailing comment',
    '/src/api/**  @org/backend',
    'orphan-pattern-without-owner',
    '',
  ].join('\n');
  const rules = parseCodeowners(text);
  assert.equal(rules.length, 5);
  assert.deepEqual(codeownersPatternToAzure('*'), []);
  assert.deepEqual(codeownersPatternToAzure('/.github/'), ['/.github/*']);
  assert.deepEqual(codeownersPatternToAzure('docs/'), ['/docs/*']);
  assert.deepEqual(codeownersPatternToAzure('*.md'), ['*.md']);
  assert.deepEqual(codeownersPatternToAzure('/src/api/**'), ['/src/api/*']);
  assert.equal(ownerToReviewer('@org/platform'), 'platform');
  assert.equal(ownerToReviewer('@alice'), 'alice');
  assert.equal(ownerToReviewer('docs@contoso.com'), 'docs@contoso.com');

  const all = codeownersToRequiredReviewers(text);
  assert.equal(all.length, 5);
  assert.deepEqual(all[1], {
    reviewers: ['devops', 'alice'],
    paths: ['/.github/*'],
    minimumApproverCount: 1,
    message: 'Code owners for /.github/ (from CODEOWNERS)',
  });
  const scoped = codeownersToRequiredReviewers(text, { skipCatchAll: true });
  assert.equal(scoped.length, 4);
  assert.ok(scoped.every((e) => e.paths.length > 0));
});

test('--codeowners merges CODEOWNERS-derived reviewers into the azure config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devkit-codeowners-'));
  writeFileSync(join(dir, 'CODEOWNERS'), '/infra/ @org/platform\n');
  const azure = {
    ...azureDefaults,
    policies: {
      ...azureDefaults.policies,
      requiredReviewers: [{ reviewers: ['x@y.z'], paths: ['/x'] }],
    },
  };
  const merged = applyCodeownersFlag(azure, { codeowners: true }, { cwd: dir });
  assert.equal(merged.policies.requiredReviewers.length, 2);
  assert.deepEqual(merged.policies.requiredReviewers[1].paths, ['/infra/*']);
  assert.equal(applyCodeownersFlag(azure, {}, { cwd: dir }), azure, 'no flag → untouched');
  assert.throws(
    () => applyCodeownersFlag(azure, { codeowners: 'missing/CODEOWNERS' }, { cwd: dir }),
    /CODEOWNERS not found/
  );
});

test('wiki publish creates a code wiki once and is a no-op when it exists', async () => {
  assert.equal(normalizeMappedPath('docs/wiki/'), '/docs/wiki');
  assert.equal(normalizeMappedPath(undefined), '/docs/wiki');
  const posts = [];
  const make = (wikis) => ({
    async get(path) {
      if (path.endsWith('/_apis/git/repositories/svc'))
        return { id: REPO, defaultBranch: 'refs/heads/main' };
      if (path.endsWith('_apis/projects/P')) return { id: 'proj-1' };
      if (path.endsWith('/_apis/wiki/wikis')) return { value: wikis };
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path, body) {
      posts.push(body);
      return { ...body, remoteUrl: 'https://dev.azure.com/o/P/_wiki/wikis/svc-docs' };
    },
  });
  await publishCodeWiki(ctxOf(make([])), { project: 'P', repo: 'svc', path: 'docs/wiki' });
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0], {
    name: 'svc-docs',
    type: 'codeWiki',
    projectId: 'proj-1',
    repositoryId: REPO,
    mappedPath: '/docs/wiki',
    version: { version: 'main' },
  });
  await publishCodeWiki(ctxOf(make([{ name: 'svc-docs', type: 'codeWiki' }])), {
    project: 'P',
    repo: 'svc',
  });
  assert.equal(posts.length, 1, 'existing wiki → no second POST');
  await publishCodeWiki(ctxOf(make([]), true), { project: 'P', repo: 'svc' });
  assert.equal(posts.length, 1, 'dry-run never posts');
  await assert.rejects(publishCodeWiki(ctxOf(make([])), { project: 'P' }), /--repo/);
});

test('scaffold-pipeline-templates writes valid extends templates with the project substituted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devkit-ptpl-'));
  const log = console.log;
  console.log = () => {};
  try {
    scaffoldPipelineTemplates({ targetDir: dir, project: 'Platform' });
  } finally {
    console.log = log;
  }
  for (const [, dest] of PIPELINE_TEMPLATE_FILES) assert.ok(existsSync(join(dir, dest)), dest);
  for (const lang of ['node', 'python', 'dotnet']) {
    const tpl = YAML.parse(readFileSync(join(dir, `pipelines/ci-${lang}.yml`), 'utf8'));
    assert.ok(
      Array.isArray(tpl.parameters) && tpl.parameters.some((p) => p.name === 'timeoutInMinutes'),
      lang
    );
    assert.ok(Array.isArray(tpl.jobs) && tpl.jobs[0].steps.length > 5, lang);
    const consumer = YAML.parse(
      readFileSync(join(dir, `examples/azure-pipelines.${lang}.yml`), 'utf8')
    );
    assert.equal(consumer.extends.template, `pipelines/ci-${lang}.yml@templates`);
    assert.equal(consumer.resources.repositories[0].name, 'Platform/pipeline-templates');
  }
  assert.match(readFileSync(join(dir, 'README.md'), 'utf8'), /Platform\/pipeline-templates/);
});
