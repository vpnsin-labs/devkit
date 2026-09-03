# On-Call

## Rotation

<!-- Schedule, escalation path, contact channels. -->

## Health signals

| Signal        | Where       | Healthy looks like                 |
| ------------- | ----------- | ---------------------------------- |
| `GET /health` | service URL | `{ "status": "ok" }` within 200 ms |

## Common alerts

### Alert name

- Symptom:
- Likely cause:
- Fix:
- Verify:

## Incident checklist

1. Acknowledge the alert and open a work item tagged `incident`.
2. Stabilise first (rollback, scale, feature flag), then diagnose.
3. Record the timeline in the work item and schedule the post-incident review.
