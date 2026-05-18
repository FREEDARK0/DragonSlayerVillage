import { defineConfig } from 'vite';
import type { ViteDevServer } from 'vite';
import { resolve } from 'path';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const postProcessConfigPath = resolve(__dirname, 'src', 'config', 'postprocessConfig.json');

function generatedDataWatcher() {
  let pending = false;
  let running = false;
  const dataFiles = new Set([
    resolve(__dirname, 'data', 'dragons.csv'),
    resolve(__dirname, 'data', 'shop_items.csv'),
    resolve(__dirname, 'data', 'relics.csv'),
  ]);

  const runGenerate = (server: ViteDevServer) => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    const child = spawn(process.execPath, ['tools/generate-data.mjs'], {
      cwd: __dirname,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      running = false;
      if (code === 0) server.ws.send({ type: 'full-reload' });
      if (pending) {
        pending = false;
        runGenerate(server);
      }
    });
  };

  return {
    name: 'dragon-data-watch',
    apply: 'serve' as const,
    configureServer(server: ViteDevServer) {
      server.watcher.add([...dataFiles]);
      server.watcher.on('change', (file) => {
        if (!dataFiles.has(resolve(file))) return;
        runGenerate(server);
      });
    },
  };
}

function postProcessConfigWriter() {
  return {
    name: 'dragon-postprocess-config-writer',
    apply: 'serve' as const,
    configureServer(server: ViteDevServer) {
      server.watcher.on('change', (file) => {
        if (resolve(file) !== postProcessConfigPath) return;
        const modules = server.moduleGraph.getModulesByFile(postProcessConfigPath);
        if (!modules) return;
        for (const mod of modules) server.moduleGraph.invalidateModule(mod);
      });
      server.middlewares.use('/__debug/postprocess-config', async (req, res) => {
        if (req.method === 'GET') {
          try {
            const content = await readFile(postProcessConfigPath, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(content);
          } catch (error) {
            res.statusCode = 404;
            res.end(error instanceof Error ? error.message : 'Not Found');
          }
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        try {
          const body = await readRequestBody(req);
          const parsed = JSON.parse(body);
          const normalized = normalizePostProcessConfig(parsed);
          const previous = await readFile(postProcessConfigPath, 'utf8').catch(() => '');
          const next = `${JSON.stringify(normalized, null, 2)}\n`;
          if (previous !== next) await writeFile(postProcessConfigPath, next, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : 'Invalid config' }));
        }
      });
    },
  };
}

function readRequestBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 64_000) reject(new Error('Request body too large'));
    });
    req.on('end', () => resolveBody(body));
    req.on('error', reject);
  });
}

function normalizePostProcessConfig(config: any) {
  const colors = Array.isArray(config?.posterizePalette?.colors)
    ? config.posterizePalette.colors.map((color: unknown) => normalizeHexColor(String(color)))
    : [];
  while (colors.length < 8) colors.push('#ffffff');
  return {
    warmTint: {
      enabled: Boolean(config?.warmTint?.enabled),
      strength: clampNumber(Number(config?.warmTint?.strength ?? 0.1), 0, 1),
      color: normalizeHexColor(String(config?.warmTint?.color ?? '#fff0b8')),
    },
    posterizePalette: {
      enabled: Boolean(config?.posterizePalette?.enabled),
      bandCount: Math.round(clampNumber(Number(config?.posterizePalette?.bandCount ?? 4), 2, 8)),
      colors: colors.slice(0, 8),
    },
    softGlow: {
      enabled: Boolean(config?.softGlow?.enabled),
      strength: clampNumber(Number(config?.softGlow?.strength ?? 0.12), 0, 1),
      threshold: clampNumber(Number(config?.softGlow?.threshold ?? 0.74), 0, 1),
      radius: clampNumber(Number(config?.softGlow?.radius ?? 2), 1, 8),
    },
  };
}

function normalizeHexColor(value: string): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : '#ffffff';
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [generatedDataWatcher(), postProcessConfigWriter()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
