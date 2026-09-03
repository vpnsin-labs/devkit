// Translate a GitHub-style CODEOWNERS file into Azure Repos "Required reviewers"
// policy entries — the migration bridge for teams moving repos to Azure Repos.
//
// Semantics differ, so this is deliberately simple and best-effort:
//   • CODEOWNERS: the LAST matching rule wins. Azure: EVERY matching policy applies.
//     A catch-all `*` rule therefore requires its owners on every PR, in addition to
//     path-specific owners. Drop the `*` line (or pass --codeowners-skip-catch-all)
//     if you only want path-scoped reviewers.
//   • Patterns: `/dir/` → `/dir/*`; `dir/` (no leading slash) → `/dir/*`; `*.md` stays
//     `*.md`; `*` → no path filter. `**` is not supported by Azure and is dropped.
//   • Owners: `user@example.com` is used as-is; `@user` → `user`; `@org/team` → `team`
//     (resolved by display name — create a matching Azure DevOps group/team first).

export function parseCodeowners(text) {
  const rules = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!owners.length) continue; // a pattern without owners clears ownership in GitHub — nothing to require
    rules.push({ pattern, owners });
  }
  return rules;
}

export function codeownersPatternToAzure(pattern) {
  let pat = pattern.replace(/\\ /g, ' ');
  if (pat === '*' || pat === '**' || pat === '/*' || pat === '/**') return [];
  pat = pat.replace(/\/\*\*$/, '/').replace(/\*\*\//g, ''); // /docs/** → /docs/ ; **/foo → foo
  const rooted = pat.includes('/');
  pat = pat.replace(/^\//, '');
  if (pat.endsWith('/')) pat += '*';
  return [rooted ? `/${pat}` : pat];
}

export function ownerToReviewer(owner) {
  if (owner.includes('@') && !owner.startsWith('@')) return owner; // e-mail address
  const name = owner.replace(/^@/, '');
  return name.includes('/') ? name.split('/').pop() : name; // @org/team → team
}

// → entries shaped like azure.policies.requiredReviewers[]
export function codeownersToRequiredReviewers(text, { skipCatchAll = false } = {}) {
  const out = [];
  for (const { pattern, owners } of parseCodeowners(text)) {
    const paths = codeownersPatternToAzure(pattern);
    if (skipCatchAll && paths.length === 0) continue;
    out.push({
      reviewers: [...new Set(owners.map(ownerToReviewer))],
      paths,
      minimumApproverCount: 1,
      message: `Code owners for ${pattern} (from CODEOWNERS)`,
    });
  }
  return out;
}
