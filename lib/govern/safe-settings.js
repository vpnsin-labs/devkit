// Scaffold a github/safe-settings admin repo: copy the declarative YAML config
// templates into a target directory (defaults to the current directory).
//
// safe-settings reads config ONLY from a central admin repo's default branch:
//   .github/settings.yml            — org defaults + org-level rulesets
//   .github/suborgs/*.yml           — group repos by name/team/property
//   .github/repos/<repo>.yml        — per-repo overrides
//   deployment-settings.yml         — runtime repo-restriction file (app host)
//
// Templates are stored under templates/safe-settings/github/** (no leading dot,
// matching devkit's template convention) and written to .github/** in the target.

import { mkdirSync, copyFileSync, readFileSync, writeFileSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './util.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(HERE, '..', '..', 'templates', 'safe-settings');

// source (relative to templates/safe-settings) → dest (relative to target dir)
const FILES = [
  ['README.md', 'SAFE-SETTINGS.md'],
  ['github/settings.yml', '.github/settings.yml'],
  ['github/suborgs/example-suborg.yml', '.github/suborgs/example-suborg.yml'],
  ['github/repos/example-repo.yml', '.github/repos/example-repo.yml'],
  ['deployment-settings.yml', 'deployment-settings.yml'],
];

export function scaffoldSafeSettings({ targetDir = process.cwd(), force = false, org } = {}) {
  log.head(`safe-settings config → ${targetDir}`);
  for (const [src, dest] of FILES) {
    const from = join(TEMPLATES, src);
    const to = join(targetDir, dest);
    mkdirSync(dirname(to), { recursive: true });
    try {
      copyFileSync(from, to, force ? 0 : constants.COPYFILE_EXCL);
    } catch (err) {
      if (err.code === 'EEXIST') {
        log.skip(`${dest} (exists, left as-is)`);
        continue;
      }
      throw err;
    }
    // Substitute the org placeholder so the scaffold is ready to use.
    if (org && dest.endsWith('.yml')) {
      const body = readFileSync(to, 'utf8').replaceAll('YOUR_ORG', org);
      writeFileSync(to, body);
    }
    log.add(dest);
  }
  log.info('Next: push this to an `admin` repo in your org and install the safe-settings GitHub App.');
}
