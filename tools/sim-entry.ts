import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimulationRunner } from '../src/simulation/SimulationRunner';
import { GreedyEconomyBot, RandomMonkeyBot, TurtleBot } from '../src/simulation/BasicBots';

const rootDir = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = parseArgs(process.argv.slice(2));
const outDir = resolve(rootDir, args.out ?? 'runs/latest');
const games = Number(args.games ?? 10);
const baseSeed = String(args.seed ?? 'sim');
const botId = String(args.bot ?? 'random');

const bot = createBot(botId);
const runner = new SimulationRunner();
const summaries = [];
const turnRows = [];
const replaySamples = [];

for (let i = 0; i < games; i++) {
  const seed = `${baseSeed}-${i}`;
  const { replay } = await runner.run(bot, { seed });
  summaries.push(replay.summary);
  for (const row of replay.turnMetrics) turnRows.push({ runId: replay.runId, ...row });
  if (i < 5 || replay.summary.finalHp <= 0) replaySamples.push(replay);
}

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'summary.csv'), toCsv(summaries), 'utf8');
await writeFile(resolve(outDir, 'turn_metrics.csv'), toCsv(turnRows), 'utf8');
await writeFile(resolve(outDir, 'replay-samples.json'), JSON.stringify(replaySamples, null, 2), 'utf8');
console.log(`Wrote ${games} ${bot.id} simulations to ${outDir}`);

function createBot(id: string) {
  if (id === 'greedy') return new GreedyEconomyBot();
  if (id === 'turtle') return new TurtleBot();
  return new RandomMonkeyBot();
}

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!value.startsWith('--')) continue;
    result[value.slice(2)] = values[i + 1]?.startsWith('--') ? 'true' : values[++i] ?? 'true';
  }
  return result;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [
    columns.join(','),
    ...rows.map(row => columns.map(column => csvCell(row[column])).join(',')),
  ].join('\n');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
