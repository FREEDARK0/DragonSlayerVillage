import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

const rootDir = resolve(import.meta.dirname, '..');
const buildDir = resolve(rootDir, '.sim-build');

await import(pathToFileURL(resolve(rootDir, 'tools/generate-data.mjs')).href);

await rm(buildDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
await esbuild.build({
  entryPoints: [resolve(rootDir, 'tools', 'sim-entry.ts')],
  outfile: resolve(buildDir, 'sim-entry.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  logLevel: 'silent',
});
await run(process.execPath, [resolve(buildDir, 'sim-entry.mjs'), ...process.argv.slice(2)]);

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit' });
    child.on('exit', code => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with ${code}`));
    });
    child.on('error', reject);
  });
}
