# pipeline-templates

Shared Azure Pipelines templates for every repository in the project, scaffolded by
`devkit govern azure scaffold-pipeline-templates`. Each template carries devkit's CI
quality gate for one language as an **extends** template, so a change here rolls out
to the whole fleet when you move a tag.

```text
pipelines/
  ci-node.yml      Node.js: nvmrc → npm ci → audit → type-check, lint, lint:md, format:check, build, test
  ci-python.yml    Python: uv sync → pip-audit → ruff check/format → mypy → markdownlint → pytest
  ci-dotnet.yml    .NET:  global.json → restore → vulnerable packages → build → dotnet format → test
examples/
  azure-pipelines.<lang>.yml   what a consumer repo's azure-pipelines.yml looks like
```

## Publish

1. Create a repository named `pipeline-templates` in the project and push this folder.
2. Tag the first release: `git tag v1 && git push --tags`. Consumers pin the tag, so
   breaking changes go to `v2`; compatible fixes move the `v1` tag forward.
3. Protect `main` like any other repo (`devkit govern azure apply --repo pipeline-templates`).

## Consume

In each repository's `azure-pipelines.yml`:

```yaml
resources:
  repositories:
    - repository: templates
      type: git
      name: YOUR_PROJECT/pipeline-templates
      ref: refs/tags/v1

extends:
  template: pipelines/ci-node.yml@templates # or ci-python.yml / ci-dotnet.yml
  parameters:
    timeoutInMinutes: 15
```

Parameters shared by all three templates:

| Parameter          | Default         | Purpose                                                                           |
| ------------------ | --------------- | --------------------------------------------------------------------------------- |
| `vmImage`          | `ubuntu-latest` | Agent image                                                                       |
| `timeoutInMinutes` | 15 / 20         | Hard cap for the job (metered parallel-job minutes)                               |
| `audit`            | `true`          | Run the non-blocking dependency vulnerability check                               |
| `preInstallSteps`  | `[]`            | Steps before dependency install, e.g. `npmAuthenticate@0` / `NuGetAuthenticate@1` |
| `postSteps`        | `[]`            | Steps after the quality gates, e.g. publish build artifacts                       |
| `installEnv`       | `{}`            | (Python) extra env for the uv steps, e.g. `UV_INDEX_AZURE_*` for a private feed   |

## Enforce

To make the template mandatory, add a **Required template** check to the environments
or service connections your deployments use (Pipelines → Environments → Approvals and
checks → Required template) pointing at `pipelines/ci-<lang>.yml@templates`. Pipelines
that do not extend it cannot use those resources.
