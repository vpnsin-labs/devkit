# Security Policy

## Supported versions

The latest released version on the default branch receives security updates.

## Reporting a vulnerability

**Please do not report security problems in a public work item, pull request or
team channel.**

Email **<security@example.com>** <!-- TODO: set your security contact -->, or create
a work item in Azure Boards under the project's restricted security area path (ask a
project administrator for access) tagged `security`.

Please include:

- affected version(s) and environment,
- steps to reproduce / proof of concept,
- impact assessment.

We aim to acknowledge reports within **48 hours** and to share a remediation
timeline after triage. Please give us a reasonable window to fix the issue
before any disclosure.

## Automated scanning

- **Trivy** (`.azuredevops/pipelines/security.yml`) scans dependencies, committed
  secrets and IaC on every pull request, on `main`, and weekly.
- **Renovate** (`.azuredevops/pipelines/renovate.yml`) keeps dependencies current.
- **GitHub Advanced Security for Azure DevOps** (CodeQL, dependency scanning, secret
  push protection) can be added with `npx devkit init --azure --ghazdo` once it is
  enabled on the repository.
