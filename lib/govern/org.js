// Organization settings (PATCH /orgs/{org}) and Actions policy hardening.
// safe-settings does not manage these, so they live on the imperative path.

import { log } from './util.js';

// Apply org-level settings. `org settings` is the merged `organization` block.
export async function applyOrgSettings(ctx, settings = {}) {
  const { octokit, org, dryRun } = ctx;

  // Split Actions-workflow-permission fields (a separate endpoint) from the rest.
  const { default_workflow_permissions, can_approve_pull_request_reviews, ...orgFields } = settings;

  if (Object.keys(orgFields).length) {
    if (dryRun) log.plan(`update org settings (${Object.keys(orgFields).join(', ')})`);
    else {
      await octokit.rest.orgs.update({ org, ...orgFields });
      log.edit(`org settings on ${org}`);
    }
  }

  if (default_workflow_permissions != null || can_approve_pull_request_reviews != null) {
    const body = {
      org,
      ...(default_workflow_permissions != null ? { default_workflow_permissions } : {}),
      ...(can_approve_pull_request_reviews != null ? { can_approve_pull_request_reviews } : {}),
    };
    if (dryRun) log.plan(`set Actions default workflow permissions on ${org}`);
    else {
      await octokit.rest.actions.setGithubActionsDefaultWorkflowPermissionsOrganization(body);
      log.edit(`Actions default workflow permissions on ${org}`);
    }
  }
}
