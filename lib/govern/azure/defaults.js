// Industry-standard branch-policy defaults for Azure Repos — the Azure DevOps
// counterpart of the GitHub ruleset in ../defaults.js: PR required with 1
// approving review (bump to 2 for stricter orgs), stale votes reset on push,
// every comment resolved, a linked work item, squash-only merges, and CI as a
// blocking build-validation gate once a pipeline is named. Repository-level
// hygiene policies (case, reserved names, path length, file size) come along.
//
// User config (governance.config.yml → azure:) is deep-merged over these; arrays
// replace, objects merge.

export default {
  // organization: 'https://dev.azure.com/YOUR_ORG',
  // project: 'YOUR_PROJECT',
  defaultBranch: 'main',

  // ── Branch policies on the default branch ──────────────────────────────────
  policies: {
    minimumReviewers: {
      enabled: true,
      blocking: true,
      minimumApproverCount: 1, // 2 for OpenSSF-style 10/10
      creatorVoteCounts: false,
      allowDownvotes: false,
      resetOnSourcePush: true, // == dismiss stale reviews on push
      requireVoteOnLastIteration: true,
      resetRejectionsOnSourcePush: false,
      blockLastPusherVote: true, // the last pusher cannot approve their own change
      requireVoteOnEachIteration: false,
    },
    workItemLinking: { enabled: true, blocking: true },
    commentResolution: { enabled: true, blocking: true },
    mergeStrategy: {
      enabled: true,
      blocking: true,
      allowSquash: true,
      allowNoFastForward: false,
      allowRebase: false,
      allowRebaseMerge: false,
    },
    // Name the CI pipeline (or give buildDefinitionId) to make it a blocking gate:
    // buildValidation:
    //   - { pipeline: CI, displayName: CI, queueOnSourceUpdateOnly: true, validDuration: 720 }
    buildValidation: [],
    // The CODEOWNERS equivalent — path-scoped required reviewers (emails, display
    // names, "[Project]\Team" groups, or identity ids). `devkit govern azure apply
    // --codeowners` derives these from a CODEOWNERS file.
    // requiredReviewers:
    //   - { reviewers: ['[YOUR_PROJECT]\\Platform Team'], paths: ['/.azuredevops/*', '/azure-pipelines.yml'], minimumApproverCount: 1, message: 'Pipeline changes need a platform review' }
    requiredReviewers: [],
    // External status checks (e.g. SonarCloud quality gate, security scanner):
    // statusChecks:
    //   - { genre: sonarcloud, name: quality-gate, blocking: true, invalidateOnSourceUpdate: true }
    statusChecks: [],
  },

  // ── Repository-level policies (apply to every branch of the repo) ──────────
  repositorySettings: {
    caseEnforcement: true, // block pushes that change only the case of a path (Windows/macOS safety)
    reservedNames: true, // block names Windows cannot check out (CON, aux, trailing dots…)
    maxPathLength: 248, // characters; 0 disables
    maxFileSizeMB: 100, // block blobs above this size; 0 disables
    authorEmailPatterns: [], // e.g. ['*@contoso.com'] — commits must come from these domains
    blockedFilePatterns: [], // e.g. ['*.pfx', '*.p12', '*.env'] — never allow these files in
  },
};
