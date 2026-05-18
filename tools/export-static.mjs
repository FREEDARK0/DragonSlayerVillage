import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(rootDir, 'dist-static');
const indexPath = resolve(outputDir, 'index.html');
const assetsDir = resolve(outputDir, 'assets');

await run(process.execPath, ['tools/generate-data.mjs']);
await run(process.execPath, [resolve(rootDir, 'node_modules', 'typescript', 'bin', 'tsc')]);
await run(process.execPath, [
  resolve(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build',
  '--base',
  './',
  '--outDir',
  'dist-static',
  '--emptyOutDir',
]);

await verifyStaticExport();
await tryCreateZip();

console.log('\nStatic export ready: dist-static/');
console.log('Upload everything inside dist-static/ to your website directory.');

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited via signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
        return;
      }
      resolvePromise();
    });
  });
}

async function verifyStaticExport() {
  if (!existsSync(indexPath)) throw new Error('Missing dist-static/index.html');
  if (!existsSync(assetsDir)) throw new Error('Missing dist-static/assets/');

  const html = await readFile(indexPath, 'utf8');
  const forbidden = [
    'src="/assets/',
    'href="/assets/',
    "src='/assets/",
    "href='/assets/",
  ];
  const offender = forbidden.find(pattern => html.includes(pattern));
  if (offender) throw new Error(`Static export still contains absolute asset path: ${offender}`);

  const assets = await readdir(assetsDir);
  const hasScript = assets.some(name => name.endsWith('.js'));
  const hasImage = assets.some(name => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(name));
  const hasAudio = assets.some(name => /\.(mp3|wav|ogg)$/i.test(name));
  if (!hasScript) throw new Error('Missing JavaScript assets in dist-static/assets/');
  if (!hasImage) throw new Error('Missing image assets in dist-static/assets/');
  if (!hasAudio) throw new Error('Missing audio assets in dist-static/assets/');
}

async function tryCreateZip() {
  const zipPath = resolve(rootDir, 'dist-static.zip');
  if (process.platform !== 'win32') return;
  const compressScript = [
    '$ErrorActionPreference = "Stop"',
    `if (Test-Path -LiteralPath ${quotePs(zipPath)}) { Remove-Item -LiteralPath ${quotePs(zipPath)} -Force }`,
    `Compress-Archive -Path ${quotePs(resolve(outputDir, '*'))} -DestinationPath ${quotePs(zipPath)} -Force`,
  ].join('; ');
  try {
    await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', compressScript]);
    const info = await stat(zipPath);
    if (info.size > 0) console.log(`Created dist-static.zip (${Math.round(info.size / 1024)} KB)`);
  } catch (error) {
    console.warn(`Could not create dist-static.zip: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function quotePs(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
