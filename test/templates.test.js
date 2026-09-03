import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import YAML from 'yaml';
import { ROOT } from './helpers.js';

const TEMPLATES = join(ROOT, 'templates');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(TEMPLATES);
const rel = (f) => relative(TEMPLATES, f).split('\\').join('/');

test('every YAML template parses (workflows, pipelines, pre-commit, dependabot, safe-settings)', () => {
  const yamls = all.filter((f) => /\.ya?ml$/.test(f));
  assert.ok(yamls.length > 30, `expected many YAML templates, found ${yamls.length}`);
  for (const f of yamls) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotThrow(() => YAML.parse(text), `invalid YAML: ${rel(f)}`);
  }
});

test('Azure Pipelines templates declare a pool and steps, and cap job time', () => {
  // (the shared `extends` templates under pipeline-templates/ are checked in govern-azure-addons)
  const pipelines = all.filter(
    (f) => /azuredevops\/.*\.yml$/.test(rel(f)) && !rel(f).includes('pipeline-templates/')
  );
  assert.ok(pipelines.length >= 12, `expected the full pipeline set, found ${pipelines.length}`);
  for (const f of pipelines) {
    const doc = YAML.parse(readFileSync(f, 'utf8'));
    assert.ok(doc.pool?.vmImage, `${rel(f)}: missing pool.vmImage`);
    assert.ok(Array.isArray(doc.jobs) && doc.jobs.length, `${rel(f)}: missing jobs`);
    for (const job of doc.jobs) {
      assert.ok(job.timeoutInMinutes > 0, `${rel(f)}: job ${job.job} has no timeoutInMinutes`);
      assert.ok(
        Array.isArray(job.steps) && job.steps.length,
        `${rel(f)}: job ${job.job} has no steps`
      );
    }
  }
});

test('GitHub workflow templates set permissions, concurrency and per-job timeouts', () => {
  const workflows = all.filter((f) => /github\/workflows\/.*\.yml$/.test(rel(f)));
  for (const f of workflows) {
    const doc = YAML.parse(readFileSync(f, 'utf8'));
    assert.ok(doc.permissions, `${rel(f)}: missing top-level permissions`);
    assert.ok(doc.concurrency, `${rel(f)}: missing concurrency`);
    for (const [name, job] of Object.entries(doc.jobs)) {
      assert.ok(job['timeout-minutes'] > 0, `${rel(f)}: job ${name} has no timeout-minutes`);
    }
  }
});

test('JSON templates parse (JSONC and placeholder-bearing files excluded)', () => {
  const jsons = all.filter((f) => /\.json$/.test(f));
  for (const f of jsons) {
    const text = readFileSync(f, 'utf8');
    if (text.includes('{{')) continue;
    // extensions.json / settings.json templates are JSONC (comments); skip those.
    if (/vscode\/(settings|extensions)\.json$/.test(rel(f))) continue;
    assert.doesNotThrow(() => JSON.parse(text), `invalid JSON: ${rel(f)}`);
  }
});

test('every statically referenced template path exists', () => {
  const libFiles = walk(join(ROOT, 'lib', 'init'));
  const missing = [];
  for (const f of libFiles) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:copyTemplate|renderTemplate|readTemplate)\(\s*'([^'$`]+)'/g)) {
      if (!existsSync(join(TEMPLATES, m[1]))) missing.push(`${relative(ROOT, f)} → ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('templates use LF line endings and shell hooks have a shebang', () => {
  for (const f of all) {
    const buf = readFileSync(f);
    if (/\.(png|jpg|ico)$/.test(f)) continue;
    assert.ok(!buf.includes('\r\n'), `CRLF in ${rel(f)}`);
  }
  for (const hook of ['dotnet/githooks/pre-commit', 'dotnet/githooks/commit-msg']) {
    assert.match(readFileSync(join(TEMPLATES, hook), 'utf8'), /^#!\/usr\/bin\/env sh/);
  }
});
