import { Game } from './Game';

async function main() {
  const game = new Game();
  await game.init();
}

main().catch(console.error);
