// Load and validate governance.config.{yml,yaml,json,js,mjs}, deep-merged over
// the industry-standard defaults so a config only needs to state overrides.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import defaults from './defaults.js';
import { requireDep, GovernError } from './util.js';

const CANDIDATES = [
  'governance.config.yml',
  'governance.config.yaml',
  'governance.config.json',
  'governance.config.js',
  'governance.config.mjs',
  '.github/governance.config.yml',
];

// Deep-merge plain objects; arrays and scalars are REPLACED (not concatenated)
// so a user can fully override the default label set or rules list.
function deepMerge(base, override) {
  if (Array.isArray(override) || override === null || typeof override !== 'object') return override;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

async function parseFile(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.json') return JSON.parse(readFileSync(file, 'utf8'));
  if (ext === '.yml' || ext === '.yaml') {
    const yaml = await requireDep('yaml');
    return (yaml.default ?? yaml).parse(readFileSync(file, 'utf8'));
  }
  if (ext === '.js' || ext === '.mjs') {
    const mod = await import(pathToFileURL(file).href);
    return mod.default ?? mod;
  }
  throw new GovernError(`Unsupported config extension: ${ext}`);
}

// Load config. If `explicitPath` is given it must exist; otherwise we probe the
// known candidate locations and fall back to bare defaults (with `cliOrg` or the
// default org) when none is found.
export async function loadConfig({ explicitPath, cliOrg, cwd = process.cwd() } = {}) {
  let file;
  if (explicitPath) {
    file = resolve(cwd, explicitPath);
    if (!existsSync(file)) throw new GovernError(`Config not found: ${file}`);
  } else {
    file = CANDIDATES.map((p) => resolve(cwd, p)).find(existsSync);
  }

  const user = file ? await parseFile(file) : {};
  const merged = deepMerge(defaults, user);
  if (cliOrg) merged.org = cliOrg; // --org overrides the file
  if (!merged.org) throw new GovernError('No org configured. Set `org:` in the config or pass --org.');

  return { config: merged, source: file ?? '(defaults only)' };
}
