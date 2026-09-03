// Scaffold a shared `pipeline-templates` repository: `extends` templates that
// carry devkit's CI job for Node, Python and .NET, plus a consumer example. One
// repo, tagged (v1, v2…), referenced by every consumer via `resources.repositories`,
// so a CI change rolls out to the fleet by moving a tag.
//
// Templates live under templates/azuredevops/pipeline-templates/** and are written
// verbatim except for the YOUR_PROJECT placeholder.

import { mkdirSync, copyFileSync, readFileSync, writeFileSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../util.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(HERE, '..', '..', '..', 'templates', 'azuredevops', 'pipeline-templates');

// source (relative to the template dir) → dest (relative to the target dir)
export const PIPELINE_TEMPLATE_FILES = [
  ['README.md', 'README.md'],
  ['pipelines/ci-node.yml', 'pipelines/ci-node.yml'],
  ['pipelines/ci-python.yml', 'pipelines/ci-python.yml'],
  ['pipelines/ci-dotnet.yml', 'pipelines/ci-dotnet.yml'],
  ['examples/azure-pipelines.node.yml', 'examples/azure-pipelines.node.yml'],
  ['examples/azure-pipelines.python.yml', 'examples/azure-pipelines.python.yml'],
  ['examples/azure-pipelines.dotnet.yml', 'examples/azure-pipelines.dotnet.yml'],
];

export function scaffoldPipelineTemplates({
  targetDir = process.cwd(),
  force = false,
  project,
} = {}) {
  log.head(`pipeline-templates → ${targetDir}`);
  for (const [src, dest] of PIPELINE_TEMPLATE_FILES) {
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
    if (project) {
      const body = readFileSync(to, 'utf8').replaceAll('YOUR_PROJECT', project);
      writeFileSync(to, body);
    }
    log.add(dest);
  }
  log.info(
    'Next: push this to a `pipeline-templates` repo, tag it v1, and point consumers at it (see README.md).'
  );
}
