/**
 * Builds a release artifact (spec 4, "Flujo de despliegue"):
 *
 *   npm run package            # builds everything, writes release/tiklive-<version>.tgz
 *   npm run package -- --skip-build
 *
 * The archive keeps the repository layout (the server finds the overlays, dashboard and
 * migrations relative to itself) but holds only what runs: compiled output, migrations and the
 * manifests. On the target, `npm ci --omit=dev` installs the dependencies, so native modules
 * match that machine (this is what deploy/windows/deploy.ps1 does).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'release');

/** What goes in, relative to the repository root. */
const CONTENT = [
  'package.json',
  'package-lock.json',
  '.nvmrc',
  'apps/server/package.json',
  'apps/server/dist',
  'apps/server/migrations',
  'apps/dashboard/package.json',
  'apps/dashboard/dist/dashboard/browser',
  'packages/contracts/package.json',
  'packages/contracts/dist',
  'packages/overlays/package.json',
  'packages/overlays/dist',
];

const { values } = parseArgs({ options: { 'skip-build': { type: 'boolean', default: false } } });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function releaseName(): string {
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    version: string;
  };
  let sha = 'nogit';
  try {
    sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
  } catch {
    // not a git checkout: the version alone identifies it
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
  return `tiklive-${version}-${stamp}-${sha}`;
}

if (!values['skip-build']) execFileSync(npm, ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

const missing = CONTENT.filter((path) => !existsSync(join(ROOT, path)));
if (missing.length > 0) {
  process.stderr.write(`Faltan archivos (¿corriste el build?): ${missing.join(', ')}\n`);
  process.exit(1);
}

const name = releaseName();
const staging = join(OUT_DIR, name);
rmSync(staging, { recursive: true, force: true });
for (const path of CONTENT) {
  cpSync(join(ROOT, path), join(staging, path), { recursive: true });
}
mkdirSync(OUT_DIR, { recursive: true });
const archive = join(OUT_DIR, `${name}.tgz`);
// tar ships with Windows 10+ and Linux; the folder inside the archive is the release name.
execFileSync('tar', ['-czf', archive, '-C', OUT_DIR, name]);
rmSync(staging, { recursive: true, force: true });
process.stdout.write(`${archive}\n`);
