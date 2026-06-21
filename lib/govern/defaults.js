// Industry-standard governance defaults — the single source of truth for the
// `devkit govern` utility AND the shape mirrored by the safe-settings templates.
//
// Values follow OpenSSF Scorecard + GitHub hardening guidance, tuned to a
// "balanced-hardened" baseline that small/medium teams can adopt without locking
// themselves out. Stricter knobs (2 reviewers, enforce-admins, signed commits)
// are called out inline so you can opt in via governance.config.yml.
//
// User config is deep-merged OVER these by config.js, so you only override what
// you want to change.

export const DEFAULT_ORG = 'vpnsin-labs';

// ── Repository settings (PATCH /repos/{owner}/{repo}) ───────────────────────
// Squash-only, clean linear history, low surface area.
export const repository = {
  has_issues: true,
  has_projects: false,
  has_wiki: false,
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  allow_auto_merge: true,
  delete_branch_on_merge: true,
  allow_update_branch: true,
  // Squash commit derives its title from the PR title (which commitlint/
  // release-please rely on) and its body from the PR body.
  squash_merge_commit_title: 'PR_TITLE',
  squash_merge_commit_message: 'PR_BODY',
  // Require a verified signature on web commits (matches required_signatures).
  web_commit_signoff_required: true,
};

// Settings used only at creation time (POST /orgs/{org}/repos). default_branch
// is intentionally absent — the create endpoint rejects it; we set it via a
// follow-up update when it differs from the org default.
export const repositoryCreate = {
  private: true, // default to private; flip with --public or config.repository.private:false
  auto_init: true, // create an initial commit so a default branch exists to protect
  has_issues: true,
  has_projects: false,
  has_wiki: false,
};

export const DEFAULT_BRANCH = 'main';

// ── Branch protection (legacy: PUT .../branches/{branch}/protection) ────────
// Note the legacy vocabulary (require_code_owner_reviews plural, strict) —
// distinct from the ruleset vocabulary below. Do NOT share these structs.
export const branchProtection = {
  required_pull_request_reviews: {
    required_approving_review_count: 1, // OpenSSF 10/10 wants 2 — bump for stricter orgs
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
    require_last_push_approval: false, // set true for the strictest profile
  },
  required_status_checks: {
    strict: true, // branch must be up to date before merge
    checks: [], // fill with CI contexts, e.g. [{ context: 'build' }]
  },
  enforce_admins: false, // true also gates admins (no bypass in legacy mode — can lock you out)
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true,
  block_creations: false,
  lock_branch: false,
  required_signatures: false, // requires org-wide commit signing — opt in deliberately
  restrictions: null, // MUST be explicit null to mean "no push restrictions"
};

// ── Ruleset (preferred: POST .../rulesets) ──────────────────────────────────
// Modern equivalent of branch protection. Ruleset vocabulary differs from
// legacy: require_code_owner_review (singular), dismiss_stale_reviews_on_push,
// strict_required_status_checks_policy, and integration_id (not app_id).
export const ruleset = {
  name: 'main-protection',
  target: 'branch',
  enforcement: 'active', // 'evaluate' (audit) is org-owned-repos only
  bypass_actors: [],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' }, // == disallow force-push
    { type: 'required_linear_history' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 1,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: true,
        require_last_push_approval: false,
        required_review_thread_resolution: true,
      },
    },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [], // fill with [{ context: 'build' }]
      },
    },
    // Opt in for the strictest profile:
    // { type: 'required_signatures' },
  ],
};

// Which protection mechanism `govern` applies: 'ruleset' (recommended),
// 'branch-protection' (legacy), or 'both'.
export const protectionMode = 'ruleset';

// ── Label taxonomy (issues.createLabel / updateLabel) ───────────────────────
// Colours are 6-hex WITHOUT a leading '#'. Descriptions <= 100 chars.
export const labels = [
  // type
  { name: 'type: bug', color: 'd73a4a', description: "Something isn't working" },
  { name: 'type: feature', color: 'a2eeef', description: 'New feature or request' },
  { name: 'type: docs', color: '0075ca', description: 'Documentation improvements or additions' },
  { name: 'type: chore', color: 'fef2c0', description: 'Maintenance, tooling, or housekeeping' },
  // priority
  { name: 'priority: P0', color: 'b60205', description: 'Critical — drop everything' },
  { name: 'priority: P1', color: 'd93f0b', description: 'High priority' },
  { name: 'priority: P2', color: 'fbca04', description: 'Medium priority' },
  { name: 'priority: P3', color: '0e8a16', description: 'Low priority' },
  // status
  { name: 'status: triage', color: 'ededed', description: 'Needs triage' },
  { name: 'status: blocked', color: '000000', description: 'Blocked by a dependency or decision' },
  { name: 'status: in-progress', color: '1d76db', description: 'Actively being worked on' },
  // size
  { name: 'size: S', color: 'c2e0c6', description: 'Small effort' },
  { name: 'size: M', color: 'fbca04', description: 'Medium effort' },
  { name: 'size: L', color: 'd93f0b', description: 'Large effort' },
  // community
  { name: 'good first issue', color: '7057ff', description: 'Good for newcomers' },
  { name: 'help wanted', color: '008672', description: 'Extra attention is needed' },
  // cross-cutting
  { name: 'dependencies', color: '0366d6', description: 'Updates a dependency file' },
  { name: 'security', color: 'ee0701', description: 'Security-impacting issue or fix' },
];

// ── Security rollout ────────────────────────────────────────────────────────
// Per-repo toggles that are FREE on public repos. On private/internal repos,
// code scanning + secret scanning need a paid licence (GitHub Code Security /
// Secret Protection) — `advanced_security` is gated by visibility in security.js.
export const security = {
  vulnerabilityAlerts: true, // dependency graph + Dependabot alerts (free everywhere)
  automatedSecurityFixes: true, // Dependabot security update PRs (free everywhere)
  privateVulnerabilityReporting: true, // free everywhere
  codeScanningDefaultSetup: true, // CodeQL default setup (free on public)
  codeScanningQuerySuite: 'default', // 'default' | 'extended'
  secretScanning: true, // free on public
  secretScanningPushProtection: true, // free on public
};

// Org-level code-security configuration body (POST /orgs/{org}/code-security/
// configurations) for fleet rollout. Field names here are the CONFIGURATION-API
// vocabulary, distinct from the per-repo security_and_analysis vocabulary.
//
// NOTE: `advanced_security` is intentionally OMITTED from the default so the
// baseline attaches cleanly to a fleet that includes PUBLIC repos (where GHAS is
// free/auto and the umbrella flag is unnecessary). For orgs that have purchased
// GitHub Code Security / Secret Protection for PRIVATE/INTERNAL repos, set
// `advanced_security: enabled` (or the granular `code_security` /
// `secret_protection`) in governance.config.yml to license those features there.
export const securityConfiguration = {
  name: 'Org Security Baseline',
  description: 'Managed by devkit govern — baseline code security rollout',
  dependency_graph: 'enabled',
  dependency_graph_autosubmit_action: 'enabled',
  dependency_graph_autosubmit_action_options: { labeled_runners: false },
  dependabot_alerts: 'enabled',
  dependabot_security_updates: 'enabled',
  code_scanning_default_setup: 'enabled',
  code_scanning_default_setup_options: { runner_type: 'standard' },
  secret_scanning: 'enabled',
  secret_scanning_push_protection: 'enabled',
  secret_scanning_validity_checks: 'enabled',
  secret_scanning_non_provider_patterns: 'enabled',
  private_vulnerability_reporting: 'enabled',
  enforcement: 'enforced', // 'unenforced' lets repo admins override
  // advanced_security: 'enabled', // ← uncomment for licensed private/internal repos
};

// How the configuration is rolled out once created.
export const securityConfigurationRollout = {
  // all | all_without_configurations | public | private_or_internal | selected
  attachScope: 'all_without_configurations',
  // all | none | private_and_internal | public — applied to NEW repos
  defaultForNewRepos: 'all',
};

// ── Organization settings (PATCH /orgs/{org}) ───────────────────────────────
// Conservative defaults: members get read by default, can't create public repos,
// Actions get read-only token scope and can't approve their own PRs.
export const organization = {
  default_repository_permission: 'read',
  members_can_create_repositories: true,
  members_can_create_public_repositories: false,
  members_can_create_private_repositories: true,
  web_commit_signoff_required: true,
  // Actions hardening (PUT /orgs/{org}/actions/permissions/workflow):
  default_workflow_permissions: 'read',
  can_approve_pull_request_reviews: false,
};

// ── Webhooks (repos.createWebhook / orgs.createWebhook) ─────────────────────
// content_type defaults to 'form' in the API — we always force 'json'.
export const webhookConfigDefaults = {
  content_type: 'json',
  insecure_ssl: '0',
};

// ── Autolinks (repos.createAutolink) ────────────────────────────────────────
// url_template MUST contain the literal <num> placeholder.
export const autolinks = [
  // { key_prefix: 'JIRA-', url_template: 'https://example.atlassian.net/browse/JIRA-<num>', is_alphanumeric: true },
];

// The default config object `govern` falls back to when no field is supplied.
export const defaults = {
  org: DEFAULT_ORG,
  defaultBranch: DEFAULT_BRANCH,
  repository,
  repositoryCreate,
  protectionMode,
  branchProtection,
  ruleset,
  labels,
  security,
  securityConfiguration,
  securityConfigurationRollout,
  organization,
  autolinks,
  webhookConfigDefaults,
};

export default defaults;
