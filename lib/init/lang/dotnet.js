// .NET language module — SDK pin (global.json), repo-wide build settings and
// analyzers (Directory.Build.props), C# code style in .editorconfig, the
// `dotnet format` pre-commit + Conventional Commit commit-msg hooks (plain git
// hooks under .githooks/, no Node or Python needed), a local tool manifest with
// versionize for releases, and an ASP.NET Core minimal-API starter.

import { execSync } from 'node:child_process';

export function configureDotnet(ctx) {
  const { c, fs } = ctx;
  console.log(
    c.bold('.NET tooling (SDK pin · analyzers · dotnet format · git hooks · versionize)')
  );
  fs.copyTemplate('dotnet/global.json', 'global.json');
  fs.copyTemplate('dotnet/Directory.Build.props', 'Directory.Build.props');
  fs.copyTemplate('dotnet/config/dotnet-tools.json', '.config/dotnet-tools.json');
  fs.copyTemplate('dotnet/githooks/pre-commit', '.githooks/pre-commit', { executable: true });
  fs.copyTemplate('dotnet/githooks/commit-msg', '.githooks/commit-msg', { executable: true });
  fs.copyTemplate('dotnet/gitignore', '.gitignore');
}

export function scaffoldDotnetStarter(ctx) {
  const { wantsBackend, solutionName, c, fs } = ctx;
  if (!wantsBackend) return;
  const { copyTemplate } = fs;
  console.log(c.bold('\nBackend app (ASP.NET Core minimal API)'));
  // .slnx is the XML solution format (SDK 9.0.200+), readable without GUID soup.
  fs.renderTemplate('dotnet/app/backend/Solution.slnx', `${solutionName}.slnx`, {});
  copyTemplate('dotnet/app/backend/src/Api/Api.csproj', 'src/Api/Api.csproj');
  copyTemplate('dotnet/app/backend/src/Api/Program.cs', 'src/Api/Program.cs');
  copyTemplate('dotnet/app/backend/src/Api/appsettings.json', 'src/Api/appsettings.json');
  copyTemplate(
    'dotnet/app/backend/src/Api/appsettings.Development.json',
    'src/Api/appsettings.Development.json'
  );
  copyTemplate(
    'dotnet/app/backend/src/Api/Properties/launchSettings.json',
    'src/Api/Properties/launchSettings.json'
  );
  copyTemplate(
    'dotnet/app/backend/tests/Api.Tests/Api.Tests.csproj',
    'tests/Api.Tests/Api.Tests.csproj'
  );
  copyTemplate(
    'dotnet/app/backend/tests/Api.Tests/HealthTests.cs',
    'tests/Api.Tests/HealthTests.cs'
  );
  copyTemplate('dotnet/app/backend/Dockerfile', 'Dockerfile');
  copyTemplate('dotnet/app/backend/dockerignore', '.dockerignore');
}

export function installDotnet(ctx) {
  const { noInstall, cwd, c, log } = ctx;
  console.log(c.bold('\nTools'));
  if (noInstall) {
    log.info('Skipped (--no-install). Restore the local tools manually:');
    log.info('dotnet tool restore');
  } else {
    try {
      log.info('dotnet tool restore');
      execSync('dotnet tool restore', { cwd, stdio: 'inherit' });
    } catch {
      console.log(
        c.yellow('  ! dotnet tool restore failed — is the .NET SDK installed? Run it manually.')
      );
    }
  }

  // Plain git hooks: point core.hooksPath at the versioned .githooks/ directory.
  console.log(c.bold('\nGit hooks'));
  try {
    execSync('git config core.hooksPath .githooks', { cwd, stdio: 'ignore' });
    log.info('git hooks installed (core.hooksPath = .githooks)');
  } catch {
    log.info(
      'Run "git config core.hooksPath .githooks" once inside the git repo to enable the hooks.'
    );
  }
}

export function dotnetNextSteps(ctx) {
  const { c, wantsBackend } = ctx;
  const verify = [
    `One-time normalise formatting:   ${c.cyan('dotnet format')}`,
    `Verify the gates:                ${c.cyan('dotnet build && dotnet format --verify-no-changes && dotnet test')}`,
  ];
  const run = wantsBackend
    ? [
        `Run the API:                     ${c.cyan('dotnet run --project src/Api')} ${c.dim('(http://localhost:5000/health)')}`,
      ]
    : [];
  return { verify, run };
}
