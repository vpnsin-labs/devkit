// File-system primitives shared by every `devkit init` module: coloured
// logging, atomic "create unless it exists" writes (honouring --force), template
// copying / rendering, and small idempotent editors for .gitignore-style files.

import {
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  constants,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEMPLATES = resolve(HERE, '..', '..', 'templates');

export const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

export const log = {
  add: (p) => console.log(`  ${c.green('+')} ${p}`),
  skip: (p) => console.log(`  ${c.dim('•')} ${c.dim(`${p} (exists, left as-is)`)}`),
  edit: (p) => console.log(`  ${c.cyan('~')} ${p}`),
  info: (m) => console.log(`  ${c.dim(m)}`),
  head: (m) => console.log(c.bold(m)),
  warn: (m) => console.log(c.yellow(`  ! ${m}`)),
};

// Build the file helpers bound to a target directory + --force flag. Every
// `init` module receives the same instance through the run context.
export function makeFs({ cwd, force }) {
  const ensureDir = (file) => mkdirSync(dirname(file), { recursive: true });

  function copyTemplate(rel, dest, { executable = false } = {}) {
    const target = join(cwd, dest);
    ensureDir(target);
    try {
      // COPYFILE_EXCL fails atomically (EEXIST) if the target exists — this avoids
      // the check-then-write race of a separate existsSync() guard.
      copyFileSync(join(TEMPLATES, rel), target, force ? 0 : constants.COPYFILE_EXCL);
    } catch (err) {
      if (err.code === 'EEXIST') return log.skip(dest);
      throw err;
    }
    if (executable) {
      try {
        chmodSync(target, 0o755);
      } catch {
        /* chmod is a no-op / unsupported on some platforms */
      }
    }
    log.add(dest);
  }

  function writeFileIfAbsent(dest, content, { executable = false } = {}) {
    const target = join(cwd, dest);
    ensureDir(target);
    try {
      // The 'wx' flag fails atomically (EEXIST) if the file exists — this avoids
      // the check-then-write race of a separate existsSync() guard.
      writeFileSync(target, content, { flag: force ? 'w' : 'wx' });
    } catch (err) {
      if (err.code === 'EEXIST') return log.skip(dest);
      throw err;
    }
    if (executable) {
      try {
        chmodSync(target, 0o755);
      } catch {
        /* see above */
      }
    }
    log.add(dest);
  }

  // Read a template and substitute `{{KEY}}` placeholders. Unknown placeholders
  // are left untouched so a stray `{{...}}` in a template shows up in the output
  // (and in the tests) instead of silently vanishing.
  function renderTemplate(rel, dest, vars = {}, opts = {}) {
    writeFileIfAbsent(dest, render(readTemplate(rel), vars), opts);
  }

  // Append `entry` to a line-oriented ignore file (.gitignore, .dockerignore …)
  // if no line already equals it. Creates the file when missing.
  function ensureLine(file, entry, { label = file } = {}) {
    const target = join(cwd, file);
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (current.split('\n').some((l) => l.trim() === entry)) {
      return log.skip(`${label} (${entry} already present)`);
    }
    ensureDir(target);
    const sep = current && !current.endsWith('\n') ? '\n' : '';
    writeFileSync(target, `${current}${sep}${entry}\n`);
    log.edit(`${label} (+${entry})`);
  }

  const ensureGitignoreEntry = (entry) => ensureLine('.gitignore', entry, { label: '.gitignore' });

  // Append a block of text to an existing file unless a marker line is already
  // present (used to add [tool.*] tables to a consumer's pyproject.toml).
  function appendBlockIfMissing(file, marker, block, { label } = {}) {
    const target = join(cwd, file);
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (current.split('\n').some((l) => l.trim() === marker)) {
      return log.skip(`${file} (${label ?? marker} already present)`);
    }
    ensureDir(target);
    const sep = current && !current.endsWith('\n') ? '\n\n' : current ? '\n' : '';
    writeFileSync(target, `${current}${sep}${block.replace(/\n*$/, '\n')}`);
    log.edit(`${file} (+${label ?? marker})`);
  }

  const readTarget = (rel) => {
    try {
      return readFileSync(join(cwd, rel), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  };

  return {
    copyTemplate,
    writeFileIfAbsent,
    renderTemplate,
    ensureLine,
    ensureGitignoreEntry,
    appendBlockIfMissing,
    readTarget,
  };
}

export function readTemplate(rel) {
  return readFileSync(join(TEMPLATES, rel), 'utf8');
}

// Placeholders come in two forms:
//   inline  `{{KEY}}`                                   → String(value)
//   line    `<indent># {{KEY}}` or `<indent><!-- {{KEY}} -->` alone on a line
//           → the value re-indented to <indent> (multi-line allowed); the whole
//             line disappears when the value is empty. This lets YAML/Markdown
//             templates carry optional blocks (extra pipeline steps, badges)
//             without leaving stray comment lines behind.
// Unknown keys are left untouched in both forms so a typo surfaces in the output.
export function render(text, vars) {
  const has = (key) => Object.prototype.hasOwnProperty.call(vars, key);
  const withBlocks = text.replace(
    /^([ \t]*)(?:# |<!-- )\{\{([A-Z0-9_]+)\}\}(?: -->)?[ \t]*(\r?\n|$)/gm,
    (m, indent, key, nl) => {
      if (!has(key)) return m;
      const value = vars[key];
      if (value === undefined || value === null || value === '') return '';
      const block = String(value)
        .replace(/\n$/, '')
        .split('\n')
        .map((l) => (l ? indent + l : l))
        .join('\n');
      return `${block}${nl}`;
    }
  );
  return withBlocks.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key) =>
    has(key) ? String(vars[key]) : m
  );
}
