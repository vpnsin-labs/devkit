# Release

## How releases work

{{RELEASE_FLOW}}

## Steps

1. Make sure `main` is green (CI pipeline) and every PR used a Conventional Commit title.
2. Pipelines → **Release** → Run pipeline on `main`. Use the dry-run parameter first to
   preview the next version and changelog.
3. Confirm the new `vX.Y.Z` tag and the CHANGELOG entry (Repos → Tags).
4. Deploy per environment (fill in): dev → test → prod.

## Rollback

<!-- How to redeploy the previous tag, and who approves it. -->
