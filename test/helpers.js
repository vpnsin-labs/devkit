// Shared helpers for the devkit test-suite: run the CLI against a fresh temp
// directory and inspect what it produced.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CLI = join(ROOT, 'bin', 'cli.js');

// The CLI always emits ANSI colours; strip them so tests can match plain text.
// (Built with the constructor so the ESC control character is not a regex literal.)
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const strip = (text) => (text ?? '').replace(ANSI, '');

// Run `devkit init <args> --no-install` inside `dir`.
export function run(dir, args, { install = false } = {}) {
  const res = spawnSync(
    process.execPath,
    [CLI, 'init', ...args, ...(install ? [] : ['--no-install'])],
    {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      timeout: 120_000,
    }
  );
  const stdout = strip(res.stdout);
  const stderr = strip(res.stderr);
  return { dir, status: res.status, out: `${stdout}\n${stderr}`, stdout, stderr };
}

// Create a temp dir, optionally seed it, then run the CLI in it.
export function scaffold(name, args, { seed, install = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `devkit-test-${name}-`));
  if (seed) seed(dir);
  return run(dir, args, { install });
}

export const seedPackageJson =
  (name = 'fixture') =>
  (dir) =>
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.1' }, null, 2));

// Sorted, POSIX-style relative paths of every file under dir (excluding .git/).
export function tree(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const rel = relative(dir, full).split('\\').join('/');
      if (rel === '.git' || rel.startsWith('.git/')) continue;
      if (statSync(full).isDirectory()) walk(full);
      else out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

export const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');

export function git(dir, ...args) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}
