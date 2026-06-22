// Shared helpers for the govern modules: coloured logging, lazy dependency
// loading, dry-run plumbing, and idempotent-action reporting.

// ── Colours (no dependency; mirrors bin/cli.js) ─────────────────────────────
export const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

export const log = {
  // Resource created.
  add: (m) => console.log(`  ${c.green('+')} ${m}`),
  // Resource changed/updated.
  edit: (m) => console.log(`  ${c.cyan('~')} ${m}`),
  // No change needed (already in desired state).
  same: (m) => console.log(`  ${c.dim('=')} ${c.dim(m)}`),
  // Skipped (not applicable / would need a licence / disabled in config).
  skip: (m) => console.log(`  ${c.dim('•')} ${c.dim(m)}`),
  // Non-fatal warning.
  warn: (m) => console.log(`  ${c.yellow('!')} ${m}`),
  // Section heading.
  head: (m) => console.log(`\n${c.bold(m)}`),
  info: (m) => console.log(`  ${c.dim(m)}`),
  // What WOULD happen in --dry-run.
  plan: (m) => console.log(`  ${c.yellow('→')} ${c.dim('[dry-run]')} ${m}`),
};

// A typed error whose message is shown to the user without a stack trace.
export class GovernError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GovernError';
    this.userFacing = true;
  }
}

// Lazy-load an optional dependency so the base `@vpnsin-labs/devkit` install
// stays lean — these are only needed when you actually run `devkit govern`.
// On failure, throw a friendly install hint instead of a raw MODULE_NOT_FOUND.
const GOVERN_DEPS = '@octokit/rest @octokit/plugin-throttling @octokit/plugin-retry libsodium-wrappers yaml';
export async function requireDep(specifier) {
  try {
    return await import(specifier);
  } catch (err) {
    if (err && (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND')) {
      throw new GovernError(
        `Missing dependency "${specifier}".\n` +
          `  The govern commands need a few extra packages. Install them once:\n\n` +
          `    npm i -D ${GOVERN_DEPS}\n`
      );
    }
    throw err;
  }
}

// Unwrap a GitHub/Octokit error into a concise, actionable message.
export function describeApiError(err, context) {
  const status = err?.status ?? err?.response?.status;
  const apiMsg = err?.response?.data?.message ?? err?.message ?? String(err);
  const errors = err?.response?.data?.errors;
  const detail = Array.isArray(errors)
    ? ' — ' + errors.map((e) => e.message || `${e.field}: ${e.code}`).join('; ')
    : '';
  const hint =
    status === 401
      ? ' (check GITHUB_TOKEN is set and valid)'
      : status === 403
        ? ' (token lacks the required scope/permission, or rate-limited)'
        : status === 404
          ? ' (resource missing, or token cannot see it)'
          : status === 422
            ? ' (invalid payload — see message above)'
            : '';
  return `${context}: ${status ?? ''} ${apiMsg}${detail}${hint}`.trim();
}

// Run an idempotent operation, swallowing a specific "already exists" status so
// callers can express create-or-update without pre-checking.
export async function tolerate(statuses, fn) {
  try {
    return await fn();
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    if (statuses.includes(status)) return undefined;
    throw err;
  }
}

// Minimal glob → RegExp for repo-name matching (`backend-*`, `*-service`).
export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

export function matchesAny(name, patterns) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((p) => globToRegExp(p).test(name));
}

// A run context threaded through every operation: the Octokit client, the org,
// and whether we are only planning changes.
export function makeCtx({ octokit, org, dryRun }) {
  return { octokit, org, dryRun: Boolean(dryRun) };
}
