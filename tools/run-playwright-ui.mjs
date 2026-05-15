import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root: rootDir,
  configFile: resolve(rootDir, 'vite.config.ts'),
  mode: 'test',
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
  },
});

let exitCode = 1;

try {
  await server.listen();
  server.printUrls();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const baseURL = `http://127.0.0.1:${port}`;

  exitCode = await runPlaywright(process.argv.slice(2), baseURL);
} finally {
  await server.close();
}

process.exitCode = exitCode;

function runPlaywright(extraArgs, baseURL) {
  return new Promise((resolvePromise, reject) => {
    const bin = process.execPath;
    const playwrightCli = resolve(rootDir, 'node_modules', 'playwright', 'cli.js');
    const args = ['test', '--config', 'playwright.ui.config.ts', ...extraArgs];
    const child = spawn(bin, [playwrightCli, ...args], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: baseURL,
      },
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        console.error(`Playwright exited via signal ${signal}`);
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}
