// Azure DevOps wikis: list the project's wikis and publish a repository folder
// (devkit's docs/wiki skeleton from `devkit init --azure --wiki`) as a code wiki.

import { log, GovernError } from '../util.js';
import { getProject, getRepo } from './client.js';

const p = (project) => encodeURIComponent(project);

export async function listWikis(client, project) {
  const data = await client.get(`${p(project)}/_apis/wiki/wikis`);
  return data?.value ?? [];
}

export function normalizeMappedPath(path) {
  const clean = String(path || '/docs/wiki')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  return clean.startsWith('/') ? clean : `/${clean}`;
}

// Publish `path` on `branch` of `repo` as a code wiki named `name` (idempotent by name).
export async function publishCodeWiki(ctx, { project, repo, name, path, branch }) {
  const { client, dryRun } = ctx;
  if (!repo) throw new GovernError('wiki publish needs --repo <name>.');
  const repoInfo = await getRepo(client, project, repo);
  const proj = await getProject(client, project);
  const wikiName = name || `${repo}-docs`;
  const mappedPath = normalizeMappedPath(path);
  const version = (branch || repoInfo.defaultBranch || 'refs/heads/main').replace(
    /^refs\/heads\//,
    ''
  );

  const existing = (await listWikis(client, project)).find((w) => w.name === wikiName);
  if (existing) {
    log.same(`wiki "${wikiName}" already exists (${existing.remoteUrl ?? existing.url ?? ''})`);
    return existing;
  }
  const body = {
    name: wikiName,
    type: 'codeWiki',
    projectId: proj.id,
    repositoryId: repoInfo.id,
    mappedPath,
    version: { version },
  };
  if (dryRun) {
    log.plan(`publish ${repo}:${version}${mappedPath} as code wiki "${wikiName}"`);
    return body;
  }
  const created = await client.post(`${p(project)}/_apis/wiki/wikis`, body);
  log.add(`wiki "${created.name}" → ${created.remoteUrl ?? created.url ?? ''}`);
  return created;
}
