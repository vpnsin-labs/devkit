// Build the run context for `devkit init`: parse flags, detect the hosting
// platform (GitHub vs Azure Repos) and the language (Node vs Python vs .NET),
// validate flag combinations, and load the consumer's package.json when the
// repo is a Node project.

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { c, log, makeFs } from './fs.js';

export const LANGS = ['node', 'python', 'dotnet'];
export const HOSTS = ['github', 'azure'];

export class InitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InitError';
    this.userFacing = true;
  }
}

// ── Detection ───────────────────────────────────────────────────────────────
const PY_MARKERS = ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'];
const DOTNET_MARKERS = ['global.json', 'Directory.Build.props'];
const DOTNET_EXTS = ['.sln', '.slnx', '.csproj', '.fsproj', '.vbproj'];

export function detectLang(cwd) {
  const found = [];
  if (existsSync(join(cwd, 'package.json'))) found.push('node');
  if (PY_MARKERS.some((f) => existsSync(join(cwd, f)))) found.push('python');
  let dotnet = DOTNET_MARKERS.some((f) => existsSync(join(cwd, f)));
  if (!dotnet) {
    try {
      dotnet = readdirSync(cwd).some((f) => DOTNET_EXTS.some((ext) => f.endsWith(ext)));
    } catch {
      dotnet = false;
    }
  }
  if (dotnet) found.push('dotnet');
  return found;
}

// dev.azure.com/org/project/_git/repo, org.visualstudio.com, ssh.dev.azure.com:v3/…
const AZURE_REMOTE = /(^|[/@.:])(dev\.azure\.com|visualstudio\.com)([/:]|$)/i;

export function isAzureRemote(url) {
  return AZURE_REMOTE.test(String(url || ''));
}

export function readRemoteUrl(cwd) {
  try {
    return execSync('git remote get-url origin', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// Pull { org, project, repo, host } out of an Azure Repos remote in any of its forms:
//   https://[user@]dev.azure.com/{org}/{project}/_git/{repo}
//   git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
//   https://{org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}
//   {org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}
export function parseAzureRemote(url) {
  if (!url) return null;
  const dec = (s) => decodeURIComponent(s.replace(/\.git$/i, ''));
  let m = /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)/i.exec(url);
  if (m) return { host: 'dev.azure.com', org: dec(m[1]), project: dec(m[2]), repo: dec(m[3]) };
  m = /ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/?#]+)/i.exec(url);
  if (m) return { host: 'dev.azure.com', org: dec(m[1]), project: dec(m[2]), repo: dec(m[3]) };
  m =
    /https?:\/\/(?:[^@/]+@)?([^.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/?#]+)/i.exec(
      url
    );
  if (m) return { host: 'visualstudio.com', org: dec(m[1]), project: dec(m[2]), repo: dec(m[3]) };
  m = /vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/([^/?#]+)/i.exec(url);
  if (m) return { host: 'visualstudio.com', org: dec(m[1]), project: dec(m[2]), repo: dec(m[3]) };
  return null;
}

// GHAS code scanning is free only on PUBLIC GitHub repos; best-effort detect via gh.
function detectPrivate(cwd, has, host) {
  if (has('--public')) return false;
  if (has('--private')) return true;
  if (host === 'azure') return true; // Azure Repos are always private to the org
  try {
    const out = execSync('gh repo view --json visibility -q .visibility', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out === 'PRIVATE';
  } catch {
    return false;
  }
}

// A safe project name derived from the directory: lowercase, kebab-case, and
// never empty (falls back to "app").
export function projectNameFrom(cwd) {
  const raw = basename(cwd)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  return raw || 'app';
}

// PascalCase variant for .NET solution names (e.g. my-api → MyApi).
export function pascalCase(name) {
  const out = String(name)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
  const safe = out.replace(/^[0-9]+/, '');
  return safe || 'App';
}

// ── Azure Artifacts ─────────────────────────────────────────────────────────
// `--artifacts <feed>` (project-scoped feed in the repo's project), `<org>/<feed>`
// (organization-scoped) or `<org>/<project>/<feed>`. Returns the protocol
// endpoints devkit writes into nuget.config / .npmrc / pyproject.toml.
export function buildArtifacts(spec, remote) {
  const parts = String(spec)
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  let org;
  let project;
  let feed;
  let host = remote?.host ?? 'dev.azure.com';
  if (parts.length === 1) {
    if (!remote) {
      throw new InitError(
        `--artifacts ${spec}: could not read the organization/project from the git remote. Use --artifacts <org>/<project>/<feed> (or <org>/<feed> for an organization-scoped feed).`
      );
    }
    [feed] = parts;
    ({ org, project } = remote);
  } else if (parts.length === 2) {
    [org, feed] = parts; // organization-scoped feed
  } else if (parts.length === 3) {
    [org, project, feed] = parts;
  } else {
    throw new InitError(
      `--artifacts ${spec}: expected <feed>, <org>/<feed> or <org>/<project>/<feed>.`
    );
  }
  if (/^https?:\/\//i.test(spec)) {
    throw new InitError(
      '--artifacts takes a feed name, not a URL (devkit derives the npm/PyPI/NuGet endpoints).'
    );
  }
  const enc = encodeURIComponent;
  const pkgsHost =
    host === 'visualstudio.com' ? `${org}.pkgs.visualstudio.com` : 'pkgs.dev.azure.com';
  const base =
    host === 'visualstudio.com'
      ? `https://${pkgsHost}${project ? `/${enc(project)}` : ''}/_packaging/${enc(feed)}/`
      : `https://${pkgsHost}/${enc(org)}${project ? `/${enc(project)}` : ''}/_packaging/${enc(feed)}/`;
  return {
    feed,
    org,
    project: project ?? null,
    pkgsHost,
    urls: {
      npm: `${base}npm/registry/`,
      pypi: `${base}pypi/simple/`,
      nuget: `${base}nuget/v3/index.json`,
    },
  };
}

const NODE_ONLY = [
  '--frontend',
  '--fullstack',
  '--mern',
  '--next',
  '--jest',
  '--vitest',
  '--publish',
  '--lighthouse',
];
const GITHUB_ONLY = ['--publish', '--lighthouse'];
const AZURE_ONLY = ['--artifacts', '--wiki', '--ghazdo', '--advanced-security'];

// ── Context ─────────────────────────────────────────────────────────────────
export function buildContext(argv, { cwd = process.cwd() } = {}) {
  const has = (flag) => argv.some((a) => a === flag || a.startsWith(`${flag}=`));
  // Value of `--flag value` or `--flag=value` (null when absent or valueless).
  const valueOf = (flag) => {
    const eq = argv.find((a) => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1) || null;
    const i = argv.indexOf(flag);
    const next = i >= 0 ? argv[i + 1] : undefined;
    return next && !next.startsWith('-') ? next : null;
  };

  // Language: explicit flag wins; otherwise detect from marker files. When
  // several are present prefer Node (backwards compatible) and say so.
  let lang = has('--python')
    ? 'python'
    : has('--dotnet')
      ? 'dotnet'
      : has('--node') || has('--next')
        ? 'node'
        : null;
  const detected = detectLang(cwd);
  if (!lang) {
    if (detected.length === 0) {
      if (has('--backend') || has('--frontend') || has('--fullstack') || has('--mern')) {
        lang = 'node';
      } else {
        throw new InitError(
          'No package.json, pyproject.toml or .NET project found in the current directory.\n' +
            '  Run inside a project, or pick the language explicitly: --node | --python | --dotnet\n' +
            '  (add --backend to scaffold a runnable starter in an empty directory).'
        );
      }
    } else {
      lang = detected[0];
      if (detected.length > 1) {
        log.info(
          `detected ${detected.join(' + ')} markers → using ${lang}; pass --${detected[1]} to override`
        );
      }
    }
  }

  // Hosting platform: explicit flag wins; otherwise sniff the origin remote.
  const remoteUrl = readRemoteUrl(cwd);
  const host =
    has('--azure') || has('--azure-devops') || has('--ado')
      ? 'azure'
      : has('--github')
        ? 'github'
        : isAzureRemote(remoteUrl)
          ? 'azure'
          : 'github';
  const azure = host === 'azure' ? parseAzureRemote(remoteUrl) : null;

  const wantsFullstack = has('--fullstack') || has('--mern');
  const wantsBackend = has('--backend');
  const wantsFrontend = has('--frontend');
  const isMonorepo = wantsFullstack;

  // ── Flag validation ─────────────────────────────────────────────────────
  if (wantsBackend && wantsFrontend) {
    throw new InitError(
      '--backend and --frontend scaffold a single flat app each. Use --fullstack for a Next.js + Express + MongoDB monorepo, or run them in separate directories.'
    );
  }
  if (wantsFullstack && (wantsBackend || wantsFrontend)) {
    throw new InitError(
      '--fullstack already scaffolds both a frontend and a backend (as npm workspaces). Drop --backend/--frontend.'
    );
  }
  if (lang !== 'node') {
    const bad = NODE_ONLY.filter(has);
    if (bad.length) {
      throw new InitError(
        `${bad.join(', ')} ${bad.length > 1 ? 'are' : 'is'} Node.js-only and cannot be combined with --${lang}.\n` +
          `  For ${lang} use --backend (runnable API starter) and the shared flags: --sonar --scorecard --skills --force --no-install.`
      );
    }
  }
  if (host === 'azure') {
    const bad = GITHUB_ONLY.filter(has);
    if (bad.length) {
      throw new InitError(
        `${bad.join(', ')} ${bad.length > 1 ? 'are' : 'is'} only available for GitHub-hosted repos (they scaffold GitHub Actions workflows).`
      );
    }
  } else {
    const bad = AZURE_ONLY.filter(has);
    if (bad.length) {
      throw new InitError(
        `${bad.join(', ')} ${bad.length > 1 ? 'are' : 'is'} only available for Azure Repos (pass --azure or add an Azure Repos origin remote).`
      );
    }
  }

  let artifacts = null;
  if (has('--artifacts')) {
    const spec = valueOf('--artifacts');
    if (!spec)
      throw new InitError(
        '--artifacts needs a feed: --artifacts <feed> | <org>/<feed> | <org>/<project>/<feed>'
      );
    artifacts = buildArtifacts(spec, azure);
  }

  // --frontend implies the Next.js preset; --backend implies the Node preset.
  const isNext =
    lang === 'node' &&
    (has('--next')
      ? true
      : has('--node')
        ? false
        : wantsFrontend
          ? true
          : wantsBackend
            ? false
            : Boolean(readPkgDeps(cwd).next));

  const isPrivate = detectPrivate(cwd, has, host);
  const force = has('--force');

  // Node projects: load the consumer package.json (created by `npm init -y`).
  let pkg = null;
  const pkgPath = join(cwd, 'package.json');
  if (lang === 'node') {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new InitError(
          'No package.json found in the current directory. Run this inside a Node project (npm init -y), or pass --python / --dotnet.'
        );
      }
      throw err;
    }
  }

  const projectName = projectNameFrom(cwd);

  return {
    cwd,
    argv,
    has,
    valueOf,
    force,
    lang,
    host,
    azure, // { host, org, project, repo } from the remote, or null
    artifacts, // Azure Artifacts feed endpoints, or null
    wantsWiki: has('--wiki'),
    isNext,
    isPrivate,
    wantsBackend,
    wantsFrontend,
    wantsFullstack,
    isMonorepo,
    pkg,
    pkgPath,
    projectName,
    solutionName: pascalCase(projectName),
    noInstall: has('--no-install'),
    fs: makeFs({ cwd, force }),
    c,
    log,
  };
}

function readPkgDeps(cwd) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

// Human labels used in the banner and docs placeholders.
export const LANG_LABEL = { node: 'Node', python: 'Python', dotnet: '.NET' };
export const HOST_LABEL = { github: 'GitHub', azure: 'Azure DevOps' };
