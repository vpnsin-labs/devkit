// GitHub Projects v2 automation — GraphQL only (there is NO REST API for
// Projects v2). Used for: adding issues/PRs to a board, updating field values,
// and status automation.
//
// CRITICAL AUTH NOTE: the default Actions GITHUB_TOKEN is repo-scoped and CANNOT
// read or write org/user Projects v2 (GraphQL returns "Resource not accessible
// by integration"). Use a classic PAT with `project` (+`repo`), a fine-grained
// PAT with org Projects read/write, or a GitHub App installation token.

import { graphql } from './octokit.js';
import { log, GovernError } from './util.js';

// Resolve an org project's node id + its fields (incl. single-select options).
export async function getProject(octokit, org, number) {
  const data = await graphql(
    octokit,
    `query($org: String!, $number: Int!) {
       organization(login: $org) {
         projectV2(number: $number) {
           id
           title
           fields(first: 50) {
             nodes {
               ... on ProjectV2FieldCommon { id name }
               ... on ProjectV2SingleSelectField { id name options { id name } }
               ... on ProjectV2IterationField {
                 id name
                 configuration { iterations { id startDate } }
               }
             }
           }
         }
       }
     }`,
    { org, number: Number(number) }
  );
  const project = data?.organization?.projectV2;
  if (!project) throw new GovernError(`Project #${number} not found in org ${org}.`);
  const fields = (project.fields?.nodes || []).filter((n) => n?.id);
  return { id: project.id, title: project.title, fields };
}

// Find a field by (case-insensitive) name.
export function findField(project, name) {
  return project.fields.find((f) => f.name?.toLowerCase() === name.toLowerCase());
}

// Resolve a single-select option id by name within a field.
export function findOption(field, optionName) {
  return (field?.options || []).find((o) => o.name?.toLowerCase() === optionName.toLowerCase())?.id;
}

// Get the GraphQL node id of an issue or PR.
export async function getContentId(octokit, owner, repo, number) {
  const data = await graphql(
    octokit,
    `query($owner: String!, $repo: String!, $number: Int!) {
       repository(owner: $owner, name: $repo) {
         issueOrPullRequest(number: $number) {
           ... on Issue { id }
           ... on PullRequest { id }
         }
       }
     }`,
    { owner, repo, number: Number(number) }
  );
  const id = data?.repository?.issueOrPullRequest?.id;
  if (!id) throw new GovernError(`Issue/PR #${number} not found in ${owner}/${repo}.`);
  return id;
}

// Add an issue/PR (by content node id) to a project. Idempotent: re-adding an
// existing item returns the existing item id. Returns the project ITEM id.
export async function addItem(octokit, projectId, contentId) {
  const data = await graphql(
    octokit,
    `mutation($project: ID!, $content: ID!) {
       addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
         item { id }
       }
     }`,
    { project: projectId, content: contentId }
  );
  return data.addProjectV2ItemById.item.id;
}

// Update one field on a project item. `value` is exactly one of:
//   { text }, { number }, { date }, { singleSelectOptionId }, { iterationId }
export async function setFieldValue(octokit, projectId, itemId, fieldId, value) {
  await graphql(
    octokit,
    `mutation($project: ID!, $item: ID!, $field: ID!, $value: ProjectV2FieldValue!) {
       updateProjectV2ItemFieldValue(input: {
         projectId: $project, itemId: $item, fieldId: $field, value: $value
       }) { projectV2Item { id } }
     }`,
    { project: projectId, item: itemId, field: fieldId, value }
  );
}

// High-level: add an issue/PR to a project and (optionally) set its Status.
// `target` = { owner, repo, number }. `status` is a Status option NAME.
export async function addToBoard(ctx, projectNumber, target, { status } = {}) {
  const { octokit, org, dryRun } = ctx;

  // Resolve the project (read-only) up front so dry-run can validate the Status
  // option exists rather than reporting a plan that would fail.
  const project = await getProject(octokit, org, projectNumber);
  const statusField = status ? findField(project, 'Status') : null;
  const optionId = status ? statusField && findOption(statusField, status) : null;
  if (status && (!statusField || !optionId)) {
    log.warn(`Status option "${status}" not found on project "${project.title}" — will add without setting status`);
  }

  if (dryRun) {
    log.plan(
      `add ${target.owner}/${target.repo}#${target.number} to project "${project.title}"` +
        (status && optionId ? ` (Status: ${status})` : '')
    );
    return;
  }

  const contentId = await getContentId(octokit, target.owner, target.repo, target.number);
  const itemId = await addItem(octokit, project.id, contentId);
  log.add(`#${target.number} → project "${project.title}"`);

  if (status && optionId) {
    await setFieldValue(octokit, project.id, itemId, statusField.id, { singleSelectOptionId: optionId });
    log.edit(`Status → ${status}`);
  }
}

// Set the Status of an already-tracked issue/PR (status automation on merge/close).
export async function setBoardStatus(ctx, projectNumber, target, statusName) {
  return addToBoard(ctx, projectNumber, target, { status: statusName });
}
