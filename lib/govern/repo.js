// Repository creation and settings.
//
// Create endpoints can't take every setting (e.g. default_branch, merge config
// on a template-generated repo), so we create then PATCH. The create call is
// idempotent-ish: if the repo already exists we fall through to updating it.

import { log, tolerate } from './util.js';
import { getRepo } from './octokit.js';

// Create a repo (from a template if `template` is given), returning the repo
// object. No-op + fetch if it already exists.
export async function createRepo(ctx, name, opts = {}) {
  const { octokit, org, dryRun } = ctx;
  const { template, createDefaults = {}, description, homepage, topics } = opts;

  // Already there?
  const existing = await tolerate([404], () => getRepo(octokit, org, name));
  if (existing) {
    log.same(`repo ${org}/${name} (exists)`);
    return existing;
  }

  if (dryRun) {
    // Validate the template exists now so a dry-run can't give false confidence.
    if (template) {
      const [tOwner, tRepo] = template.includes('/') ? template.split('/') : [org, template];
      const tpl = await tolerate([404], () => getRepo(octokit, tOwner, tRepo));
      if (!tpl) log.warn(`template ${tOwner}/${tRepo} not found (create would 404)`);
      else if (!tpl.is_template) log.warn(`${tOwner}/${tRepo} is not marked as a template repo`);
    }
    log.plan(`create repo ${org}/${name}${template ? ` from template ${template}` : ''}`);
    return { name, owner: { login: org }, default_branch: ctx.defaultBranch || 'main', __planned: true };
  }

  let data;
  if (template) {
    const [tOwner, tRepo] = template.includes('/') ? template.split('/') : [org, template];
    ({ data } = await octokit.rest.repos.createUsingTemplate({
      template_owner: tOwner,
      template_repo: tRepo,
      owner: org,
      name,
      description,
      private: createDefaults.private ?? true,
      include_all_branches: false,
    }));
  } else {
    ({ data } = await octokit.rest.repos.createInOrg({
      org,
      name,
      description,
      homepage,
      ...createDefaults, // private, auto_init, has_issues, has_projects, has_wiki, ...
    }));
  }
  log.add(`repo ${org}/${name}`);

  if (topics?.length) {
    await octokit.rest.repos.replaceAllTopics({ owner: org, repo: name, names: topics });
    log.add(`topics [${topics.join(', ')}]`);
  }
  return data;
}

// Apply repository settings (merge strategy, features, metadata) and ensure the
// default branch matches. `settings` is the merged `repository` block.
export async function applyRepoSettings(ctx, repo, settings, { defaultBranch } = {}) {
  const { octokit, org, dryRun } = ctx;
  if (!settings || Object.keys(settings).length === 0) return;

  if (dryRun) {
    log.plan(`update settings on ${org}/${repo} (${Object.keys(settings).join(', ')})`);
  } else {
    await octokit.rest.repos.update({ owner: org, repo, ...settings });
    log.edit(`settings on ${org}/${repo}`);
  }

  // default_branch is rejected on create — rename it here if it differs. This is
  // a read+mutate, so skip it entirely in dry-run (a planned repo has no branch
  // to read yet, and dry-run should make no mutating calls).
  if (defaultBranch && !dryRun) {
    const current = await getRepo(octokit, org, repo).catch(() => null);
    if (current && current.default_branch && current.default_branch !== defaultBranch) {
      await tolerate([422], () =>
        octokit.rest.repos.renameBranch({
          owner: org,
          repo,
          branch: current.default_branch,
          new_name: defaultBranch,
        })
      );
      log.edit(`default branch → ${defaultBranch}`);
    }
  } else if (defaultBranch && dryRun) {
    log.plan(`ensure default branch = ${defaultBranch}`);
  }
}

// Set repository topics (replace-all).
export async function applyTopics(ctx, repo, topics) {
  const { octokit, org, dryRun } = ctx;
  if (!topics?.length) return;
  if (dryRun) return log.plan(`set topics [${topics.join(', ')}]`);
  await octokit.rest.repos.replaceAllTopics({ owner: org, repo, names: topics });
  log.edit(`topics [${topics.join(', ')}]`);
}

// Create autolink references (idempotent: skips existing key_prefixes).
export async function applyAutolinks(ctx, repo, autolinks = []) {
  const { octokit, org, dryRun } = ctx;
  if (!autolinks.length) return;
  const existing = await octokit.paginate(octokit.rest.repos.listAutolinks, { owner: org, repo });
  const have = new Set(existing.map((a) => a.key_prefix));
  for (const al of autolinks) {
    if (have.has(al.key_prefix)) {
      log.same(`autolink ${al.key_prefix}`);
      continue;
    }
    if (dryRun) log.plan(`create autolink ${al.key_prefix}`);
    else {
      await octokit.rest.repos.createAutolink({
        owner: org,
        repo,
        key_prefix: al.key_prefix,
        url_template: al.url_template,
        is_alphanumeric: al.is_alphanumeric ?? true,
      });
      log.add(`autolink ${al.key_prefix}`);
    }
  }
}
