#!/usr/bin/env node
// devkit CLI — scaffolds shared lint/format/commit/CI/release tooling into a
// Node.js/Next.js, Python or .NET repo hosted on GitHub or Azure Repos, and
// governs GitHub orgs / Azure DevOps projects.
//
// Usage:
//   npx devkit init [--node|--next|--python|--dotnet] [--github|--azure] [--backend] [--force] [--no-install]
//   npx devkit govern <command> [options]
//   npx devkit govern azure <command> [options]
//
// The init implementation lives in lib/init/ (one module per language and host);
// govern lives in lib/govern/ with its optional deps lazy-loaded so the base
// install stays lean.

const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'init';

function fail(err) {
  if (err && err.userFacing) {
    console.error(`\n\x1b[31m✗\x1b[0m ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

if (cmd === 'govern') {
  const { runGovern } = await import('../lib/govern/index.js');
  try {
    await runGovern(argv.slice(1));
    process.exit(0);
  } catch (err) {
    fail(err);
  }
}

const { runInit, printHelp } = await import('../lib/init/index.js');

if (cmd === 'help') {
  printHelp();
  process.exit(0);
}

if (cmd !== 'init') {
  console.error(`Unknown command "${cmd}". Run: npx devkit --help`);
  process.exit(1);
}

try {
  await runInit(argv[0] === 'init' ? argv.slice(1) : argv);
} catch (err) {
  fail(err);
}
