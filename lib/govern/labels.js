// Label sync — create missing labels, update drifted ones, optionally prune
// labels not in the desired set. Colours are 6-hex without '#'.

import { log } from './util.js';

const norm = (color) => String(color || '').replace(/^#/, '').toLowerCase();

// Sync `labels` (array of {name, color, description}) onto org/repo.
// opts.prune deletes labels not present in the desired set.
export async function syncLabels(ctx, repo, labels, { prune = false } = {}) {
  const { octokit, org, dryRun } = ctx;
  const existing = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner: org,
    repo,
    per_page: 100,
  });
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
  const desiredNames = new Set(labels.map((l) => l.name.toLowerCase()));

  for (const label of labels) {
    const color = norm(label.color);
    const current = byName.get(label.name.toLowerCase());
    if (!current) {
      if (dryRun) log.plan(`create label "${label.name}"`);
      else {
        await octokit.rest.issues.createLabel({
          owner: org,
          repo,
          name: label.name,
          color,
          description: label.description ?? '',
        });
        log.add(`label "${label.name}"`);
      }
      continue;
    }
    const drifted =
      norm(current.color) !== color || (current.description ?? '') !== (label.description ?? '');
    if (!drifted) {
      log.same(`label "${label.name}"`);
      continue;
    }
    if (dryRun) log.plan(`update label "${label.name}"`);
    else {
      await octokit.rest.issues.updateLabel({
        owner: org,
        repo,
        name: current.name,
        color,
        description: label.description ?? '',
      });
      log.edit(`label "${label.name}"`);
    }
  }

  if (prune) {
    for (const l of existing) {
      if (desiredNames.has(l.name.toLowerCase())) continue;
      if (dryRun) log.plan(`delete label "${l.name}"`);
      else {
        await octokit.rest.issues.deleteLabel({ owner: org, repo, name: l.name });
        log.edit(`deleted label "${l.name}"`);
      }
    }
  }
}
