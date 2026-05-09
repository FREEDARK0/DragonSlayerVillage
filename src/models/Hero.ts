import { Direction } from '../utils/Direction';
import { GAME_CONSTANTS } from '../config/constants';

export interface HeroState {
  power: number;
  direction: Direction;
  isAlive: boolean;
}

export function createHero(direction?: Direction): HeroState {
  return {
    power: GAME_CONSTANTS.HERO_INITIAL_POWER,
    direction: direction ?? Direction.DOWN,
    isAlive: true,
  };
}

export function heroTakeDamage(hero: HeroState, amount: number): void {
  hero.power = Math.max(0, hero.power - amount);
  if (hero.power <= 0) hero.isAlive = false;
}

export function heroGainPower(hero: HeroState, amount: number): void {
  hero.power += amount;
}
