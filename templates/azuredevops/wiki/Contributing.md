# Contributing

The repository's `CONTRIBUTING.md` is the source of truth for branching, Conventional
Commits, review rules and releases. This page adds the Azure DevOps specifics.

## Branches and work items

- Branch from `main` as `feature/<work-item-id>-short-description`; the commit hook
  appends `AB#<id>` so the pull request links the work item automatically.
- Complete pull requests with **squash**; the PR title becomes the Conventional Commit
  that the release tooling reads.

## Pull request templates

`.azuredevops/pull_request_template.md` is applied to every PR. Pick a variant
(`hotfix`, `release`, `dependencies`) from the template dropdown when it fits.

## Editing this wiki

Pages are Markdown files under `docs/wiki`; change them through a pull request. Add
new pages to the `.order` file in the same folder, and put subpages in a folder
named after the parent page. Diagrams use `::: mermaid` blocks; `[[_TOC_]]` renders a
table of contents and `[[_TOSP_]]` lists the subpages.
