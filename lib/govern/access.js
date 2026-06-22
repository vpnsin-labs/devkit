// Access control — grant teams and collaborators access to a repository.
// permission strings: pull | triage | push | maintain | admin.

import { log, matchesAny } from './util.js';

// Grant each configured team access to the repo. Team entries:
//   { name | slug, permission, include?: [globs], exclude?: [globs] }
// include/exclude filter WHICH repos the team applies to (by repo name).
export async function applyTeams(ctx, repo, teams = []) {
  const { octokit, org, dryRun } = ctx;
  for (const team of teams) {
    const slug = team.slug || slugify(team.name);
    if (!appliesToRepo(repo, team)) {
      log.skip(`team ${slug} (excluded for ${repo})`);
      continue;
    }
    if (dryRun) {
      log.plan(`grant team ${slug} → ${team.permission} on ${repo}`);
      continue;
    }
    await octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
      org,
      team_slug: slug,
      owner: org,
      repo,
      permission: team.permission,
    });
    log.edit(`team ${slug} → ${team.permission}`);
  }
}

// Grant individual collaborators. Entries:
//   { username, permission, include?: [globs], exclude?: [globs] }
export async function applyCollaborators(ctx, repo, collaborators = []) {
  const { octokit, org, dryRun } = ctx;
  for (const collab of collaborators) {
    if (!appliesToRepo(repo, collab)) {
      log.skip(`collaborator ${collab.username} (excluded for ${repo})`);
      continue;
    }
    if (dryRun) {
      log.plan(`add ${collab.username} → ${collab.permission} on ${repo}`);
      continue;
    }
    await octokit.rest.repos.addCollaborator({
      owner: org,
      repo,
      username: collab.username,
      permission: collab.permission,
    });
    log.edit(`collaborator ${collab.username} → ${collab.permission}`);
  }
}

// Ensure org teams exist (create if missing). Entries: { name, description?,
// privacy?: closed|secret, parent? }. Returns a name→{id, slug} map.
export async function ensureTeams(ctx, teams = []) {
  const { octokit, org, dryRun } = ctx;
  const map = new Map();
  for (const team of teams) {
    const slug = team.slug || slugify(team.name);
    try {
      const { data } = await octokit.rest.teams.getByName({ org, team_slug: slug });
      map.set(team.name, { id: data.id, slug: data.slug });
      log.same(`team ${slug}`);
    } catch (err) {
      if ((err.status ?? err.response?.status) !== 404) throw err;
      if (dryRun) {
        log.plan(`create team ${slug}`);
        continue;
      }
      const { data } = await octokit.rest.teams.create({
        org,
        name: team.name,
        description: team.description,
        privacy: team.privacy || 'closed',
        ...(team.parent_team_id ? { parent_team_id: team.parent_team_id } : {}),
      });
      map.set(team.name, { id: data.id, slug: data.slug });
      log.add(`team ${slug}`);
    }
  }
  return map;
}

function appliesToRepo(repo, entry) {
  if (entry.exclude && matchesAny(repo, entry.exclude)) return false;
  if (entry.include) return matchesAny(repo, entry.include);
  return true;
}

function slugify(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
