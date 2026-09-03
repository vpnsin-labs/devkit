# Architecture

[[_TOC_]]

## Context

<!-- Who calls this system, what it calls, and the trust boundaries. -->

::: mermaid
flowchart LR
User([User]) --> API[{{PROJECT_NAME}}]
API --> DB[(Database)]
API --> Ext[External service]
:::

## Components

| Component | Responsibility | Owner |
| --------- | -------------- | ----- |
|           |                |       |

## Data

<!-- Storage, retention, classification (PII?), backups. -->

## Cross-cutting concerns

- Authentication and authorisation:
- Observability (logs, metrics, traces):
- Resilience (timeouts, retries, circuit breakers):

## Decisions

Significant choices are recorded as ADRs under [Decisions](Architecture/Decisions.md).
